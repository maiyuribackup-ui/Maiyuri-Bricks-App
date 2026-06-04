/**
 * Wall-system cost comparison — the deterministic math behind the
 * "Total Cost of Construction" reframe (interlock vs red brick vs AAC).
 *
 * Pure + unit-tested. No I/O. The numbers themselves are founder-owned config
 * (factory_settings.wall_cost_config, snapshotted per quote) — this module only
 * does arithmetic on them, so it never fabricates construction economics.
 */
import type {
  WallCostConfig,
  WallCostLineItems,
  WallCostComparison,
  WallSystem,
  WallSystemResult,
} from "@maiyuri/shared";

const round0 = (n: number) => Math.round(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

const SYSTEMS: WallSystem[] = ["interlock", "red_brick", "aac"];

/**
 * Seeded PLACEHOLDER values (₹/sq.ft of wall). Clearly flagged — the founder
 * must replace these with Maiyuri's real numbers before the comparison is
 * trustworthy. Interlock's edge is structural: no plastering, less mortar.
 */
export const PLACEHOLDER_WALL_COST_CONFIG: WallCostConfig = {
  interlock: { masonry_units: 55, mortar_cement: 8, plastering: 0, labour: 22 },
  red_brick: { masonry_units: 48, mortar_cement: 18, plastering: 35, labour: 38 },
  aac: { masonry_units: 60, mortar_cement: 14, plastering: 32, labour: 30 },
  is_seeded_placeholder: true,
};

export function sumLineItems(items: WallCostLineItems): number {
  return (
    (items.masonry_units || 0) +
    (items.mortar_cement || 0) +
    (items.plastering || 0) +
    (items.labour || 0)
  );
}

/** True when every line item across every system is zero/absent. */
export function isEmptyConfig(config: WallCostConfig | null | undefined): boolean {
  if (!config) return true;
  return SYSTEMS.every((s) => sumLineItems(config[s]) <= 0);
}

const ZERO: WallCostLineItems = {
  masonry_units: 0,
  mortar_cement: 0,
  plastering: 0,
  labour: 0,
};

/**
 * Effective config for a quote: a (possibly partial) per-quote override deep-
 * merged over the global template. Per-cell — a rep can tweak one number
 * without losing the rest.
 */
export function mergeWallCosts(
  global: WallCostConfig | null | undefined,
  override: Partial<WallCostConfig> | null | undefined,
): WallCostConfig {
  const base = global ?? PLACEHOLDER_WALL_COST_CONFIG;
  const pick = (s: WallSystem): WallCostLineItems => ({
    ...ZERO,
    ...(base[s] ?? {}),
    ...((override?.[s] as Partial<WallCostLineItems>) ?? {}),
  });
  return {
    interlock: pick("interlock"),
    red_brick: pick("red_brick"),
    aac: pick("aac"),
    is_seeded_placeholder:
      override?.is_seeded_placeholder ?? base.is_seeded_placeholder,
    updated_at: override?.updated_at ?? base.updated_at,
    updated_by: override?.updated_by ?? base.updated_by,
  };
}

/**
 * Build the comparison for a given wall area. Returns null when there's nothing
 * trustworthy to show (no/zero config, or no positive area) — callers hide the
 * section rather than render a broken/zero comparison.
 */
export function computeWallComparison(
  config: WallCostConfig | null | undefined,
  areaSqft: number | null | undefined,
): WallCostComparison | null {
  if (!areaSqft || areaSqft <= 0) return null;
  if (isEmptyConfig(config)) return null;
  const cfg = config as WallCostConfig;

  const interlockPerSqft = sumLineItems(cfg.interlock);

  const systems: WallSystemResult[] = SYSTEMS.map((system) => {
    const perSqft = round2(sumLineItems(cfg[system]));
    const buildTotal = round0(perSqft * areaSqft);
    const deltaRupeesVsInterlock = round0(
      (perSqft - interlockPerSqft) * areaSqft,
    );
    const deltaPctVsInterlock =
      interlockPerSqft > 0
        ? round0(((perSqft - interlockPerSqft) / interlockPerSqft) * 100)
        : 0;
    return {
      system,
      perSqft,
      buildTotal,
      deltaPctVsInterlock,
      deltaRupeesVsInterlock,
    };
  });

  // Interlock is the headline only if it's genuinely the cheapest total build.
  const cheapest = systems.reduce((min, s) =>
    s.perSqft < min.perSqft ? s : min,
  );
  const interlockIsCheapest = cheapest.system === "interlock";

  return { areaSqft, systems, interlockIsCheapest };
}
