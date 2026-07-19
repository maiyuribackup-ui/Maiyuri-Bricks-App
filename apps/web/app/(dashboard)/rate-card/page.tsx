"use client";

/**
 * 💰 Rate Card — delivered price per product per km band (Golden Hour GH0).
 * The auto-quote and the AI pre-call brief price from this table; when a
 * distance has no band the product's base price is used as fallback.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type Product = { id: string; name: string; unit: string; base_price: number };
type Entry = {
  id: string;
  product_id: string;
  km_from: number;
  km_to: number;
  unit_price: number;
};
type RateCard = { products: Product[]; entries: Entry[] };
type BandDraft = { km_from: string; km_to: string; unit_price: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
  return body.data as T;
}
async function putJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
  return body.data;
}

function ProductBands({
  product,
  initial,
}: {
  product: Product;
  initial: Entry[];
}) {
  const queryClient = useQueryClient();
  // Initialized from props; the parent remounts this component (key includes
  // the server data hash) whenever fresh bands arrive, so no sync effect.
  const [bands, setBands] = useState<BandDraft[]>(() =>
    initial.map((e) => ({
      km_from: String(e.km_from),
      km_to: String(e.km_to),
      unit_price: String(e.unit_price),
    })),
  );
  const [dirty, setDirty] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      putJson("/api/rate-card", {
        product_id: product.id,
        bands: bands.map((b) => ({
          km_from: Number(b.km_from),
          km_to: Number(b.km_to),
          unit_price: Number(b.unit_price),
        })),
      }),
    onSuccess: () => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["rate-card"] });
    },
  });

  const set = (i: number, key: keyof BandDraft, value: string) => {
    setBands((prev) => prev.map((b, j) => (j === i ? { ...b, [key]: value } : b)));
    setDirty(true);
  };
  const addBand = () => {
    const lastTo = bands.length ? bands[bands.length - 1].km_to : "0";
    setBands((prev) => [
      ...prev,
      { km_from: lastTo, km_to: "", unit_price: "" },
    ]);
    setDirty(true);
  };
  const removeBand = (i: number) => {
    setBands((prev) => prev.filter((_, j) => j !== i));
    setDirty(true);
  };

  const invalid = bands.some(
    (b) =>
      b.km_from === "" ||
      b.km_to === "" ||
      b.unit_price === "" ||
      Number(b.km_to) <= Number(b.km_from),
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">{product.name}</h3>
          <p className="text-xs text-slate-500">
            per {product.unit} · fallback base price ₹{product.base_price}
          </p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || invalid || save.isPending}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : dirty ? "Save" : "Saved ✓"}
        </button>
      </div>

      {save.isError ? (
        <p className="mb-2 text-sm text-red-600">
          {save.error instanceof Error ? save.error.message : "Save failed"}
        </p>
      ) : null}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-1">From km</th>
            <th className="py-1">To km</th>
            <th className="py-1">₹ / {product.unit} (delivered)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {bands.map((b, i) => (
            <tr key={i} className="border-t border-slate-100">
              {(["km_from", "km_to", "unit_price"] as const).map((key) => (
                <td key={key} className="py-1.5 pr-3">
                  <input
                    type="number"
                    min={0}
                    step={key === "unit_price" ? "0.25" : "1"}
                    value={b[key]}
                    onChange={(e) => set(i, key, e.target.value)}
                    className="w-28 rounded-lg border border-slate-200 px-2 py-1"
                  />
                </td>
              ))}
              <td className="py-1.5 text-right">
                <button
                  onClick={() => removeBand(i)}
                  className="text-xs text-red-500 hover:underline"
                >
                  remove
                </button>
              </td>
            </tr>
          ))}
          {bands.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-3 text-sm text-slate-400">
                No bands — quotes fall back to the base price. Add the first
                band (e.g. 0 → 20 km).
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <button
        onClick={addBand}
        className="mt-2 text-sm font-medium text-orange-600 hover:underline"
      >
        + Add km band
      </button>
    </div>
  );
}

export default function RateCardPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["rate-card"],
    queryFn: () => getJson<RateCard>("/api/rate-card"),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">💰 Rate Card</h1>
        <p className="text-sm text-slate-500">
          Delivered price per product by distance band. Used by auto-quotes and
          the sales pre-call brief — keep it current and quoting stays
          hands-free.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Failed to load"}
        </p>
      ) : (
        (data?.products ?? []).map((p) => {
          const mine = (data?.entries ?? []).filter(
            (e) => e.product_id === p.id,
          );
          // Key carries the server state → editor remounts on fresh data.
          const hash = mine
            .map((e) => `${e.km_from}-${e.km_to}-${e.unit_price}`)
            .join("|");
          return <ProductBands key={`${p.id}:${hash}`} product={p} initial={mine} />;
        })
      )}
    </div>
  );
}
