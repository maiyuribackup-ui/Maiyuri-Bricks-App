"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@maiyuri/ui";
import type { SmartQuote, SmartQuotePricingConfig } from "@maiyuri/shared";

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
export function SmartQuoteReview({ quote }: { quote: SmartQuote }) {
  const queryClient = useQueryClient();
  const pricing = (quote.pricing_config ?? {}) as Partial<SmartQuotePricingConfig>;

  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<string>(
    pricing.default_area_sqft != null ? String(pricing.default_area_sqft) : "",
  );
  const [distance, setDistance] = useState<string>(
    pricing.default_distance_km != null ? String(pricing.default_distance_km) : "",
  );
  const [showTransport, setShowTransport] = useState<boolean>(
    pricing.show_transport !== false,
  );
  const [repPhone, setRepPhone] = useState<string>(pricing.rep_phone ?? "");
  const [note, setNote] = useState<string>(pricing.price_note ?? "");
  const [saved, setSaved] = useState(false);

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
            default_area_sqft: area ? Number(area) : null,
            default_distance_km: distance ? Number(distance) : null,
            show_transport: showTransport,
            rep_phone: repPhone || null,
            price_note: note || null,
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
        <span>⚙️ Review &amp; adjust estimate defaults</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="text-slate-500 dark:text-slate-400">Default area / qty</span>
              <input
                type="number"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-slate-500 dark:text-slate-400">Delivery distance (km)</span>
              <input
                type="number"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
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
        </div>
      )}
    </div>
  );
}
