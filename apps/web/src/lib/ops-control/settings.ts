/**
 * Operations Control — operational settings accessor.
 *
 * Every threshold the PRD calls "configurable" lives in the oc_settings
 * singleton (PRD §81, §100). Nothing in this module may hard-code an
 * operational value; callers read from here instead.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { OcSettings } from "@maiyuri/shared";

/**
 * Column defaults, mirroring the migration. Used ONLY when the singleton row
 * cannot be read, so a transient database problem degrades to documented
 * behaviour rather than an exception mid-shift.
 *
 * These are the PRD §100 seeded operating defaults — NOT business values.
 * Labour rates and cement ratios deliberately have no fallback anywhere: they
 * must come from configuration, and their absence is surfaced, never guessed.
 */
export const OC_SETTINGS_FALLBACK: OcSettings = {
  default_shifts_per_day: 2,
  normal_max_trips_per_day: 2,
  load_green_min_pct: 95,
  load_yellow_min_pct: 80,
  load_red_above_pct: 100,
  cement_bag_kg: 50,
  cement_bag_step: 0.5,
  ratio_amber_tolerance_pct: 5,
  ratio_red_tolerance_pct: 10,
  production_wage_basis: "accepted",
  output_per_person_basis: "accepted",
};

/** Numeric columns arrive from PostgREST as strings; coerce them once here. */
function coerce(row: Record<string, unknown>): OcSettings {
  const num = (key: keyof OcSettings, fallback: number) => {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    default_shifts_per_day:
      num("default_shifts_per_day", 2) === 1 ? 1 : 2,
    normal_max_trips_per_day: num("normal_max_trips_per_day", 2),
    load_green_min_pct: num("load_green_min_pct", 95),
    load_yellow_min_pct: num("load_yellow_min_pct", 80),
    load_red_above_pct: num("load_red_above_pct", 100),
    cement_bag_kg: num("cement_bag_kg", 50),
    cement_bag_step: num("cement_bag_step", 0.5),
    ratio_amber_tolerance_pct: num("ratio_amber_tolerance_pct", 5),
    ratio_red_tolerance_pct: num("ratio_red_tolerance_pct", 10),
    production_wage_basis:
      row.production_wage_basis === "gross" ? "gross" : "accepted",
    output_per_person_basis:
      row.output_per_person_basis === "gross" ? "gross" : "accepted",
  };
}

export async function getOcSettings(): Promise<OcSettings> {
  const { data, error } = await supabaseAdmin
    .from("oc_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[OpsControl] Failed to load settings:", error);
    return OC_SETTINGS_FALLBACK;
  }
  return coerce(data as Record<string, unknown>);
}

/**
 * Is a cement bag quantity a legal multiple of the configured step?
 * PRD §32: 3, 3.5, 4, 4.5 are valid at a 0.5 step. The step is configurable,
 * so this is checked in the API rather than by a database CHECK.
 *
 * Uses integer arithmetic — 0.1 + 0.2 style float error would reject valid
 * entries such as 4.5 at a 0.1 step.
 */
export function isValidBagQuantity(bags: number, step: number): boolean {
  if (!Number.isFinite(bags) || bags < 0) return false;
  if (!Number.isFinite(step) || step <= 0) return false;
  const scale = 1000;
  const scaledBags = Math.round(bags * scale);
  const scaledStep = Math.round(step * scale);
  return scaledBags % scaledStep === 0;
}
