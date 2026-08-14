"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@maiyuri/ui";
import type {
  SmartQuote,
  SmartQuotePricingConfig,
  WallCostConfig,
} from "@maiyuri/shared";
import { WallCostComparison } from "@/components/wall-cost/WallCostComparison";
import { WallCostSettings } from "@/components/wall-cost/WallCostSettings";
import { computeWallComparison } from "@/lib/pricing/wall-cost";
import { useProducts } from "@/hooks/useEstimates";

interface Engagement {
  viewed: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  sectionViewCount: number;
  sectionsSeen: string[];
  langToggled: boolean;
  ctaClicked: boolean;
  lastCtaAt: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Staff-facing engagement strip + "review & tweak pricing before share" panel
 * for a generated Smart Quote.
 */
/** A line being edited. Strings, because a half-typed number is not a number. */
interface DraftLine {
  productId: string;
  quantity: string;
  rate: string;
}

/**
 * Read pricing_config back into editable rows.
 *
 * A quote written before multi-product keeps its single line in
 * default_product / default_area_sqft / quoted_rate, so it is lifted into the
 * same shape and edits exactly like a multi-product one.
 */
function toDraftLines(
  pricing: Partial<SmartQuotePricingConfig>,
): DraftLine[] {
  if (pricing.items?.length) {
    return pricing.items.map((i) => ({
      productId: i.product_id,
      quantity: String(i.quantity),
      rate: String(i.rate),
    }));
  }
  return [
    {
      productId: pricing.default_product ?? "",
      quantity:
        pricing.default_area_sqft != null ? String(pricing.default_area_sqft) : "",
      rate: pricing.quoted_rate != null ? String(pricing.quoted_rate) : "",
    },
  ];
}

export function SmartQuoteReview({ quote }: { quote: SmartQuote }) {
  const queryClient = useQueryClient();
  const pricing = (quote.pricing_config ?? {}) as Partial<SmartQuotePricingConfig>;

  const [open, setOpen] = useState(false);
  const [distance, setDistance] = useState<string>(
    pricing.default_distance_km != null ? String(pricing.default_distance_km) : "",
  );
  const [showTransport, setShowTransport] = useState<boolean>(
    pricing.show_transport !== false,
  );
  // One row per priced product. The engineer's rate is authoritative: when
  // set, the customer's quote uses it and never the rate card. A quote written
  // before multi-product keeps its single line in default_product /
  // default_area_sqft / quoted_rate, so it reads back into the same shape and
  // edits identically.
  const [lines, setLines] = useState<DraftLine[]>(() => toDraftLines(pricing));
  const [specialTerms, setSpecialTerms] = useState<string>(
    pricing.special_terms ?? "",
  );

  // Line 1, for the blocks below that still speak in a single rate — the
  // wall-cost comparison and the estimate preview.
  const area = lines[0]?.quantity ?? "";
  const rate = lines[0]?.rate ?? "";
  const product = lines[0]?.productId ?? "";

  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const linesTotal = lines.reduce((sum, l) => {
    const q = Number(l.quantity);
    const r = Number(l.rate);
    return sum + (q > 0 && r > 0 ? q * r : 0);
  }, 0);
  const [repPhone, setRepPhone] = useState<string>(pricing.rep_phone ?? "");
  const [note, setNote] = useState<string>(pricing.price_note ?? "");
  const [saved, setSaved] = useState(false);
  const [editWall, setEditWall] = useState(false);

  // Products the engineer can quote against
  const { data: productsResp } = useProducts();
  const productList = productsResp?.data ?? [];

  const wallSave = useMutation({
    mutationFn: async (cfg: WallCostConfig) => {
      const res = await fetch(`/api/smart-quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wall_cost_config: cfg }),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      setEditWall(false);
      queryClient.invalidateQueries({ queryKey: ["smart-quote", quote.lead_id] });
    },
  });

  const wallArea = area ? Number(area) : pricing.default_area_sqft ?? null;
  const wallComparison = computeWallComparison(quote.wall_cost_config, wallArea);

  // Engagement
  const { data: engagement } = useQuery<Engagement | null>({
    queryKey: ["sq-engagement", quote.id],
    queryFn: async () => {
      const res = await fetch(`/api/smart-quotes/${quote.id}/engagement`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data as Engagement;
    },
    refetchInterval: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/smart-quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pricing_config: {
            items: lines
              .filter((l) => l.productId && Number(l.quantity) > 0 && Number(l.rate) > 0)
              .map((l) => ({
                product_id: l.productId,
                quantity: Number(l.quantity),
                rate: Number(l.rate),
              })),
            // Line 1 mirrored onto the original fields, which the paths that
            // predate items[] still read.
            default_product: lines[0]?.productId || null,
            default_area_sqft: lines[0]?.quantity ? Number(lines[0].quantity) : null,
            quoted_rate: lines[0]?.rate ? Number(lines[0].rate) : null,
            default_distance_km: distance ? Number(distance) : null,
            show_transport: showTransport,
            rep_phone: repPhone || null,
            price_note: note || null,
            special_terms: specialTerms.trim() || null,
          },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["smart-quote", quote.lead_id] });
    },
  });

  return (
    <div className="space-y-3">
      {/* Engagement strip */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Customer engagement
        </div>
        {engagement?.viewed ? (
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              👁 Viewed {engagement.viewCount}× · {timeAgo(engagement.lastViewedAt)}
            </span>
            {engagement.sectionViewCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                📖 {engagement.sectionViewCount} sections
              </span>
            )}
            {engagement.ctaClicked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                🟢 Tapped WhatsApp · {timeAgo(engagement.lastCtaAt)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Not opened yet — share the link to start tracking.
          </p>
        )}
      </div>

      {/* Review & tweak pricing */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <span>⚙️ Set the quote — product, quantity &amp; rate</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          {/* The lines that ARE the quote. One row per product. */}
          {lines.map((line, i) => (
            <div
              key={i}
              className="space-y-2 rounded-md border border-slate-200 dark:border-slate-700 p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Line {i + 1}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, n) => n !== i))}
                    className="text-[11px] font-medium text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <label className="block text-xs">
                <span className="text-slate-500 dark:text-slate-400">Product</span>
                <select
                  value={line.productId}
                  onChange={(e) => updateLine(i, { productId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                >
                  <option value="">Select product…</option>
                  {(productList ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Quantity</span>
                  <input
                    type="number"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Rate (₹ per unit)</span>
                  <input
                    type="number"
                    value={line.rate}
                    onChange={(e) => updateLine(i, { rate: e.target.value })}
                    placeholder="e.g. 42"
                    className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              {Number(line.quantity) > 0 && Number(line.rate) > 0 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ₹{(Number(line.quantity) * Number(line.rate)).toLocaleString("en-IN")}
                </p>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setLines((prev) => [...prev, { productId: "", quantity: "", rate: "" }])
            }
            className="w-full rounded-md border border-dashed border-slate-300 dark:border-slate-600 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            + Add another product
          </button>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {linesTotal > 0
              ? `Total ₹${linesTotal.toLocaleString("en-IN")}. Your rate is the quote — the rate card is not used.`
              : "Leave the rate blank to fall back to the rate card."}
          </p>
          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400">Delivery distance (km)</span>
            <input
              type="number"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400">Rep WhatsApp number (CTA)</span>
            <input
              type="tel"
              value={repPhone}
              onChange={(e) => setRepPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400">Price note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Includes GST"
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Terms for this project (one per line)
            </span>
            <textarea
              value={specialTerms}
              onChange={(e) => setSpecialTerms(e.target.value)}
              rows={3}
              placeholder={"Delivery in two lots" + String.fromCharCode(10) + "Rate held until 30 September"}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
            />
            <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
              Prints on this quotation only. The standing terms live in Settings.
            </span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showTransport}
              onChange={(e) => setShowTransport(e.target.checked)}
              className="rounded border-slate-300"
            />
            Include delivery in the estimate
          </label>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full"
          >
            {saveMutation.isPending ? "Saving…" : saved ? "✓ Saved" : "Save defaults"}
          </Button>

          {/* Personalize the build-cost comparison for this customer */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                🧱 Build-cost comparison
              </span>
              <button
                onClick={() => setEditWall((v) => !v)}
                className="text-xs font-medium text-blue-600 dark:text-blue-400"
              >
                {editWall ? "Close" : "Personalize ₹"}
              </button>
            </div>
            {editWall ? (
              <WallCostSettings
                initial={quote.wall_cost_config}
                saving={wallSave.isPending}
                onSave={(cfg) => wallSave.mutate(cfg)}
              />
            ) : wallComparison ? (
              <WallCostComparison comparison={wallComparison} language="en" />
            ) : (
              <p className="text-xs text-slate-400">
                Set a default area above to preview the build-cost comparison.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
