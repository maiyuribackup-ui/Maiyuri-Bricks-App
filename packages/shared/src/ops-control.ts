/**
 * Operations Control (oc_) — Phase 1 shared types + zod schemas.
 *
 * Data model: supabase/migrations/20260822090000_ops_control_masters.sql
 * PRD: "Production, Fulfilment & Dispatch Control" v1.0
 *
 * The same schemas validate both the API body and the React Hook Form, so a
 * rule is expressed once. Business VALUES (rates, cement ratios, capacities)
 * never appear here — PRD §100 requires them to come from configuration.
 */

import { z } from "zod";

// ============================================
// Enums
// ============================================

/** Where a labour activity reads its eligible quantity from (PRD §62). */
export const ocQuantitySourceSchema = z.enum([
  "production_actual",
  "trip_load",
  "delivery_stop",
]);
export type OcQuantitySource = z.infer<typeof ocQuantitySourceSchema>;

/** Basis for a quantity used in a calculation. The cement ratio is ALWAYS
 *  gross (PRD §35); the labour wage basis is configurable (PRD §63). They are
 *  deliberately not the same setting. */
export const ocQuantityBasisSchema = z.enum(["gross", "accepted"]);
export type OcQuantityBasis = z.infer<typeof ocQuantityBasisSchema>;

/** Deviation reason masters are scoped so production and delivery pickers
 *  stay separate (PRD §29, §55). */
export const ocDeviationScopeSchema = z.enum(["production", "delivery"]);
export type OcDeviationScope = z.infer<typeof ocDeviationScopeSchema>;

/** Classification of an Odoo sales-order line. Only `product` is demand:
 *  service lines such as Loading carry brick-sized quantities that would
 *  otherwise corrupt the plan. */
export const ocLineKindSchema = z.enum([
  "product",
  "service",
  "note",
  "unmapped",
]);
export type OcLineKind = z.infer<typeof ocLineKindSchema>;

/** Severity model for the warning framework (PRD §72). Warnings warn; only
 *  data-integrity failures block. */
export const ocSeveritySchema = z.enum([
  "info",
  "green",
  "yellow",
  "orange",
  "red",
]);
export type OcSeverity = z.infer<typeof ocSeveritySchema>;

// ============================================
// Shared field helpers
// ============================================

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/** An effective period. Open-ended (`effective_to: null`) means "still in
 *  force". Periods are INCLUSIVE at both ends, so a rate ending 31 Aug and one
 *  starting 1 Sep do not overlap — matching the database EXCLUDE constraint. */
const effectivePeriod = {
  effective_from: isoDate,
  effective_to: isoDate.nullable().optional(),
};

const effectivePeriodOrdered = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (v: unknown) => {
      const { effective_from, effective_to } = v as {
        effective_from: string;
        effective_to?: string | null;
      };
      return !effective_to || effective_to >= effective_from;
    },
    { message: "effective_to must not be before effective_from", path: ["effective_to"] },
  );

// ============================================
// Settings (PRD §81 "Operational Settings")
// ============================================

export const ocSettingsSchema = z.object({
  default_shifts_per_day: z.union([z.literal(1), z.literal(2)]),
  normal_max_trips_per_day: z.number().int().positive(),
  load_green_min_pct: z.number().min(0),
  load_yellow_min_pct: z.number().min(0),
  load_red_above_pct: z.number().min(0),
  cement_bag_kg: z.number().positive(),
  cement_bag_step: z.number().positive(),
  ratio_amber_tolerance_pct: z.number().min(0),
  ratio_red_tolerance_pct: z.number().min(0),
  production_wage_basis: ocQuantityBasisSchema,
  output_per_person_basis: ocQuantityBasisSchema,
});
export type OcSettings = z.infer<typeof ocSettingsSchema>;

export const updateOcSettingsSchema = ocSettingsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No settings supplied")
  .refine(
    (v) =>
      v.load_yellow_min_pct === undefined ||
      v.load_green_min_pct === undefined ||
      v.load_yellow_min_pct <= v.load_green_min_pct,
    { message: "Yellow threshold must be at or below green", path: ["load_yellow_min_pct"] },
  )
  .refine(
    (v) =>
      v.ratio_amber_tolerance_pct === undefined ||
      v.ratio_red_tolerance_pct === undefined ||
      v.ratio_amber_tolerance_pct <= v.ratio_red_tolerance_pct,
    { message: "Amber tolerance must be at or below red", path: ["ratio_amber_tolerance_pct"] },
  );
export type UpdateOcSettingsInput = z.infer<typeof updateOcSettingsSchema>;

// ============================================
// Activity rates (PRD §56-61)
// ============================================

export const createOcActivityRateSchema = effectivePeriodOrdered(
  z.object({
    finished_good_id: z.string().uuid(),
    activity_code: z.string().min(1),
    rate: z.number().min(0, "Rate cannot be negative"),
    uom: z.string().default("per_brick"),
    notes: z.string().nullable().optional(),
    ...effectivePeriod,
  }),
);
export type CreateOcActivityRateInput = z.infer<typeof createOcActivityRateSchema>;

export const updateOcActivityRateSchema = z.object({
  rate: z.number().min(0).optional(),
  effective_to: isoDate.nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateOcActivityRateInput = z.infer<typeof updateOcActivityRateSchema>;

// ============================================
// Consumption standards (PRD §34-37)
// ============================================

export const createOcConsumptionStandardSchema = effectivePeriodOrdered(
  z.object({
    finished_good_id: z.string().uuid(),
    material: z.string().default("cement"),
    /** Bricks produced per one 50 kg bag. */
    standard_yield: z.number().positive("Standard yield must be greater than zero"),
    uom: z.string().default("50kg_bag"),
    /** Per-product override; null falls back to the global tolerance. */
    tolerance_pct: z.number().min(0).nullable().optional(),
    notes: z.string().nullable().optional(),
    ...effectivePeriod,
  }),
);
export type CreateOcConsumptionStandardInput = z.infer<
  typeof createOcConsumptionStandardSchema
>;

// ============================================
// Vehicles and capacities (PRD §41-42)
// ============================================

export const createOcVehicleSchema = z.object({
  vehicle_type: z.string().min(1),
  description: z.string().nullable().optional(),
  registration: z.string().nullable().optional(),
});
export type CreateOcVehicleInput = z.infer<typeof createOcVehicleSchema>;

export const createOcVehicleCapacitySchema = effectivePeriodOrdered(
  z.object({
    vehicle_id: z.string().uuid(),
    finished_good_id: z.string().uuid(),
    /** Maximum NORMAL full load. Exceeding it warns; it never blocks (PRD §45). */
    full_load_qty: z.number().int().positive(),
    notes: z.string().nullable().optional(),
    ...effectivePeriod,
  }),
);
export type CreateOcVehicleCapacityInput = z.infer<
  typeof createOcVehicleCapacitySchema
>;

// ============================================
// Deviation reasons (PRD §29, §55)
// ============================================

export const createOcDeviationReasonSchema = z.object({
  scope: ocDeviationScopeSchema,
  code: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "Use lower-case letters, digits and underscores"),
  label: z.string().min(1),
  sort_order: z.number().int().default(0),
});
export type CreateOcDeviationReasonInput = z.infer<
  typeof createOcDeviationReasonSchema
>;

// ============================================
// Product mapping (Odoo product -> finished good)
// ============================================

/** Mapping is PURELY odoo_product_id -> finished_good_id. Line classification
 *  is a separate responsibility that reads Odoo's own display_type and product
 *  type during the sales-order sync. */
export const createOcProductMappingSchema = z.object({
  odoo_product_id: z.number().int().positive(),
  odoo_product_name: z.string().nullable().optional(),
  finished_good_id: z.string().uuid(),
  notes: z.string().nullable().optional(),
});
export type CreateOcProductMappingInput = z.infer<
  typeof createOcProductMappingSchema
>;

export const createOcClassificationOverrideSchema = z.object({
  odoo_product_id: z.number().int().positive(),
  odoo_product_name: z.string().nullable().optional(),
  line_kind: ocLineKindSchema,
  reason: z.string().nullable().optional(),
});
export type CreateOcClassificationOverrideInput = z.infer<
  typeof createOcClassificationOverrideSchema
>;

// ============================================
// Phase 2 — demand, site locations, delivery schedules
// Data model: supabase/migrations/20260823090000_ops_control_demand.sql
// ============================================

/** Schedule header/version workflow states (PRD §13). */
export const ocScheduleVersionStatusSchema = z.enum([
  "draft",
  "sent",
  "confirmed",
  "revision_requested",
  "superseded",
  "cancelled",
]);
export type OcScheduleVersionStatus = z.infer<typeof ocScheduleVersionStatusSchema>;

export const createOcSiteLocationSchema = z.object({
  odoo_partner_id: z.number().int().positive().nullable().optional(),
  customer_name: z.string().min(1),
  site_name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  gmaps_url: z.string().url().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  contact_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type CreateOcSiteLocationInput = z.infer<typeof createOcSiteLocationSchema>;

export const updateOcSiteLocationSchema = createOcSiteLocationSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "No fields supplied");
export type UpdateOcSiteLocationInput = z.infer<typeof updateOcSiteLocationSchema>;

/** One dated quantity for one SO line (PRD §12). */
export const ocScheduleLineInputSchema = z.object({
  so_line_id: z.string().uuid(),
  delivery_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date"),
  quantity: z.number().positive("Quantity must be greater than zero"),
  notes: z.string().nullable().optional(),
});
export type OcScheduleLineInput = z.infer<typeof ocScheduleLineInputSchema>;

export const createOcScheduleSchema = z.object({
  odoo_order_id: z.number().int().positive(),
  site_location_id: z.string().uuid().nullable().optional(),
  lines: z.array(ocScheduleLineInputSchema).min(1, "A schedule needs at least one delivery"),
  /** Set with reason when knowingly scheduling beyond the open order (PRD §26). */
  overschedule_override_reason: z.string().min(1).nullable().optional(),
});
export type CreateOcScheduleInput = z.infer<typeof createOcScheduleSchema>;

export const createOcScheduleVersionSchema = z.object({
  /** Required whenever the schedule already has a confirmed version (PRD §14). */
  revision_reason: z.string().min(1).nullable().optional(),
  site_location_id: z.string().uuid().nullable().optional(),
});
export type CreateOcScheduleVersionInput = z.infer<typeof createOcScheduleVersionSchema>;

export const replaceOcScheduleLinesSchema = z.object({
  lock_version: z.number().int().min(0),
  lines: z.array(ocScheduleLineInputSchema).min(1),
  overschedule_override_reason: z.string().min(1).nullable().optional(),
});
export type ReplaceOcScheduleLinesInput = z.infer<typeof replaceOcScheduleLinesSchema>;

export const confirmOcScheduleVersionSchema = z.object({
  lock_version: z.number().int().min(0),
  confirmation_note: z.string().nullable().optional(),
});
export type ConfirmOcScheduleVersionInput = z.infer<typeof confirmOcScheduleVersionSchema>;
