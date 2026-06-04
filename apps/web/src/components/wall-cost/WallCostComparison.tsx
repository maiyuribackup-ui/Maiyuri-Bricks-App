"use client";

/**
 * WallCostComparison — customer-facing "why interlock costs less to build"
 * visual. Presentational only: give it a computed comparison + language and it
 * renders bars + deltas + the one-liner. Renders nothing when there's no
 * trustworthy comparison; suppresses the "cheaper" claim if interlock isn't
 * actually the cheapest (misconfig guard handled upstream too).
 */
import type {
  SmartQuoteLanguage,
  WallCostComparison as Comparison,
} from "@maiyuri/shared";
import { wallCostStrings } from "@/lib/pricing/wall-cost-i18n";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const SYSTEM_STYLES: Record<
  string,
  { bar: string; ring: string; text: string }
> = {
  interlock: {
    bar: "bg-gradient-to-r from-emerald-500 to-green-500",
    ring: "ring-2 ring-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  red_brick: {
    bar: "bg-gradient-to-r from-rose-400 to-red-500",
    ring: "ring-1 ring-slate-200 dark:ring-slate-700",
    text: "text-slate-600 dark:text-slate-300",
  },
  aac: {
    bar: "bg-gradient-to-r from-amber-400 to-orange-500",
    ring: "ring-1 ring-slate-200 dark:ring-slate-700",
    text: "text-slate-600 dark:text-slate-300",
  },
};

export function WallCostComparison({
  comparison,
  language,
}: {
  comparison: Comparison | null | undefined;
  language?: SmartQuoteLanguage | null;
}) {
  if (!comparison || comparison.systems.length === 0) return null;
  const t = wallCostStrings(language);
  const showClaim = comparison.interlockIsCheapest;

  const maxPerSqft = Math.max(...comparison.systems.map((s) => s.perSqft), 1);
  // Order so interlock leads when it's the cheapest.
  const ordered = [...comparison.systems].sort((a, b) => a.perSqft - b.perSqft);

  // Biggest saving vs a conventional alternative (for the headline).
  const interlock = comparison.systems.find((s) => s.system === "interlock");
  const maxCompetitorTotal = Math.max(
    ...comparison.systems
      .filter((s) => s.system !== "interlock")
      .map((s) => s.buildTotal),
    0,
  );
  const youSave =
    interlock && maxCompetitorTotal > interlock.buildTotal
      ? maxCompetitorTotal - interlock.buildTotal
      : 0;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Brand accent strip (Maiyuri orange) */}
      <div className="h-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-500" />
      <div className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xl">🧱</span>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {t.sectionTitle}
          </h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {t.subtitle}
        </p>

        {showClaim && youSave > 0 && (
          <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
            <span className="text-sm text-emerald-700 dark:text-emerald-300">
              {t.youSave}{" "}
              <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
                {inr(youSave)}
              </span>{" "}
              <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                ({comparison.areaSqft.toLocaleString("en-IN")} sq.ft)
              </span>
            </span>
          </div>
        )}

      <div className="space-y-3">
        {ordered.map((s) => {
          const style = SYSTEM_STYLES[s.system] ?? SYSTEM_STYLES.aac;
          const width = Math.max((s.perSqft / maxPerSqft) * 100, 6);
          const isInterlock = s.system === "interlock";
          return (
            <div key={s.system}>
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-sm font-semibold ${isInterlock ? style.text : "text-slate-700 dark:text-slate-200"}`}
                >
                  {t.systemNames[s.system]}
                  {isInterlock && s.perSqft > 0 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      ✓ {t.noPlaster}
                    </span>
                  )}
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {inr(s.perSqft)}
                  <span className="font-normal text-xs text-slate-400">
                    {" "}
                    /{t.perSqft}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-lg ${style.bar} flex items-center justify-end pr-2`}
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-[10px] font-semibold text-white/90 tabular-nums whitespace-nowrap">
                      {t.totalBuild}: {inr(s.buildTotal)}
                    </span>
                  </div>
                </div>
                {showClaim && !isInterlock && s.deltaPctVsInterlock > 0 && (
                  <span className="flex-shrink-0 w-20 text-right text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                    +{s.deltaPctVsInterlock}%
                  </span>
                )}
                {(!showClaim || isInterlock || s.deltaPctVsInterlock <= 0) && (
                  <span className="flex-shrink-0 w-20" />
                )}
              </div>
            </div>
          );
        })}
      </div>

        {showClaim && (
          <p className="mt-4 text-sm font-medium text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
            <span>💡</span>
            <span>{t.oneLiner}</span>
          </p>
        )}

        {/* Maiyuri verified value chips (brand) */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {t.valueChips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
