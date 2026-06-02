"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildWhatsAppUrl } from "@maiyuri/shared";
import type {
  SmartQuoteLanguage,
  SmartQuotePricingConfig,
} from "@maiyuri/shared";

interface OfferedProduct {
  id: string;
  name: string;
  unit: string;
}

interface EstimateResult {
  subtotal: number;
  transport: number;
  total: number;
  perSqft: number | null;
  lineItems: { name: string; unit: string; unitPrice: number; quantity: number; total: number }[];
}

interface InteractiveEstimateProps {
  slug: string;
  language: SmartQuoteLanguage;
  products: OfferedProduct[];
  pricing: Partial<SmartQuotePricingConfig> | null | undefined;
  quoteUrl: string;
  onCtaTrack: (payload: Record<string, unknown>) => void;
}

const t = (lang: SmartQuoteLanguage, en: string, ta: string) =>
  lang === "ta" ? ta : en;

const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN");

export function InteractiveEstimate({
  slug,
  language,
  products,
  pricing,
  quoteUrl,
  onCtaTrack,
}: InteractiveEstimateProps) {
  const defaultProductId =
    pricing?.default_product ?? products[0]?.id ?? null;
  const [productId, setProductId] = useState<string | null>(defaultProductId);
  const [quantity, setQuantity] = useState<number>(
    pricing?.default_area_sqft ?? 1000,
  );
  const [distanceKm, setDistanceKm] = useState<number>(
    pricing?.default_distance_km ?? 0,
  );
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );
  const unitLabel = selectedProduct?.unit === "piece"
    ? t(language, "bricks", "செங்கற்கள்")
    : t(language, "sq.ft", "சதுர அடி");
  const showTransport = pricing?.show_transport !== false;

  // Debounced live estimate
  useEffect(() => {
    if (!productId || !quantity || quantity <= 0) {
      setResult(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sq/${slug}/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            quantity,
            distance_km: showTransport && distanceKm > 0 ? distanceKm : null,
          }),
        });
        const json = await res.json();
        if (json?.data) setResult(json.data as EstimateResult);
      } catch {
        /* estimate is best-effort */
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [slug, productId, quantity, distanceKm, showTransport]);

  const handleWhatsApp = useCallback(() => {
    const phone = pricing?.rep_phone;
    const lines = [
      t(language, "Hi! I built an estimate on my Maiyuri quote:", "வணக்கம்! எனது மையூரி மதிப்பீடு:"),
      selectedProduct ? `• ${selectedProduct.name} × ${quantity} ${unitLabel}` : "",
      result ? `• ${t(language, "Total", "மொத்தம்")}: ${inr(result.total)}` : "",
      "",
      quoteUrl,
    ].filter(Boolean);
    const message = lines.join("\n");
    onCtaTrack({
      product_id: productId,
      quantity,
      distance_km: distanceKm,
      total: result?.total ?? null,
    });
    const url = phone
      ? buildWhatsAppUrl(phone, message)
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }, [pricing, language, selectedProduct, quantity, unitLabel, result, quoteUrl, onCtaTrack, productId, distanceKm]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
        {t(language, "Your instant estimate", "உங்கள் உடனடி மதிப்பீடு")}
      </h2>
      <p className="mt-2 text-center text-sm text-slate-500">
        {t(
          language,
          "Adjust the details to see your price — built from our live rates.",
          "விவரங்களை மாற்றி உங்கள் விலையைப் பாருங்கள் — எங்கள் நேரடி விலையிலிருந்து.",
        )}
      </p>

      <div className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
        {/* Product selector */}
        {products.length > 1 && (
          <div className="mb-5">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
              {t(language, "Product", "தயாரிப்பு")}
            </label>
            <div className="flex flex-wrap gap-2">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProductId(p.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    productId === p.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="mb-5">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {selectedProduct?.unit === "piece"
                ? t(language, "Quantity", "அளவு")
                : t(language, "Built-up area", "கட்டிட பரப்பளவு")}
            </label>
            <span className="text-sm font-semibold text-slate-900">
              {quantity.toLocaleString("en-IN")} {unitLabel}
            </span>
          </div>
          <input
            type="range"
            min={selectedProduct?.unit === "piece" ? 100 : 200}
            max={selectedProduct?.unit === "piece" ? 50000 : 5000}
            step={selectedProduct?.unit === "piece" ? 100 : 50}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>

        {/* Delivery distance */}
        {showTransport && (
          <div className="mb-5">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              {t(language, "Delivery distance", "டெலிவரி தூரம்")}
              {pricing?.locality_label ? ` · ${pricing.locality_label}` : ""}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={distanceKm || ""}
                onChange={(e) => setDistanceKm(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-sm text-slate-500">
                km {t(language, "from our factory", "எங்கள் தொழிற்சாலையிலிருந்து")}
              </span>
            </div>
          </div>
        )}

        {/* Result */}
        <div className="mt-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white">
          {result ? (
            <>
              <div className="flex items-end justify-between">
                <span className="text-sm text-slate-300">
                  {t(language, "Estimated total", "மதிப்பிடப்பட்ட மொத்தம்")}
                </span>
                <span className={`text-3xl font-bold ${loading ? "opacity-50" : ""}`}>
                  {inr(result.total)}
                </span>
              </div>
              {result.perSqft != null && (
                <div className="mt-1 text-right text-xs text-amber-300">
                  ≈ {inr(result.perSqft)} {t(language, "per sq.ft", "ஒரு சதுர அடிக்கு")}
                </div>
              )}
              <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>{t(language, "Materials", "பொருட்கள்")}</span>
                  <span>{inr(result.subtotal)}</span>
                </div>
                {showTransport && (
                  <div className="flex justify-between text-slate-300">
                    <span>{t(language, "Delivery", "டெலிவரி")}</span>
                    <span>{result.transport > 0 ? inr(result.transport) : "—"}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-3 text-center text-sm text-slate-300">
              {t(language, "Adjust the details above to see your estimate.", "மேலே விவரங்களை மாற்றவும்.")}
            </div>
          )}
        </div>

        {pricing?.price_note && (
          <p className="mt-3 text-center text-xs text-slate-400">{pricing.price_note}</p>
        )}
        <p className="mt-2 text-center text-[11px] text-slate-400">
          {t(
            language,
            "Indicative estimate for materials & delivery. Final quote confirmed by our team.",
            "பொருட்கள் & டெலிவரிக்கான தோராய மதிப்பீடு. இறுதி விலை எங்கள் குழுவால் உறுதி செய்யப்படும்.",
          )}
        </p>

        {/* WhatsApp CTA */}
        <button
          onClick={handleWhatsApp}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[#1ebe5b]"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
            <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.595z"/>
          </svg>
          {t(language, "Confirm on WhatsApp", "WhatsApp-ல் உறுதிப்படுத்தவும்")}
        </button>
      </div>
    </div>
  );
}
