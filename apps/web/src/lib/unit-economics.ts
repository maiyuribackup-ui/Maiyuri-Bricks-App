/**
 * Unit Economics (standard cost) — server-side data access.
 *
 * Staff edit ONE mutable draft; an admin publishes it as an immutable version
 * with a valid_from date, and the Intelligence Layer reads the published
 * standard through v_standard_costs_current. Nothing derived is stored: every
 * per-unit number comes from computeBundle() in @maiyuri/shared, which mirrors
 * the SQL view v_std_cost_brick_type_computed.
 *
 * All writes use the service-role client, so the role gate lives in the API
 * routes (see STD_COST_PUBLISH_ROLES).
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  StdCostBrickType,
  StdCostBundle,
  StdCostDraftPayload,
  StdCostFixedItem,
  StdCostReference,
  StdCostReferencePayload,
  StdCostRmPrice,
  StdCostVersion,
  StdCostVersionSummary,
} from "@maiyuri/shared";

/** Only these roles may publish a draft as the new standard (PRD §4). */
export const STD_COST_PUBLISH_ROLES = ["founder", "owner"] as const;

export function canPublishStandardCost(role: string | null | undefined): boolean {
  return !!role && (STD_COST_PUBLISH_ROLES as readonly string[]).includes(role);
}

const VERSION_COLUMNS =
  "id, status, valid_from, monthly_production_basis, notes, created_by, created_at, updated_by, updated_at, published_by, published_at";

/** Postgres numerics arrive as strings over PostgREST — coerce every one. */
function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toVersion(row: Record<string, unknown>): StdCostVersion {
  return {
    id: String(row.id),
    status: row.status as StdCostVersion["status"],
    valid_from: (row.valid_from as string | null) ?? null,
    monthly_production_basis: num(row.monthly_production_basis),
    notes: (row.notes as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_by: (row.updated_by as string | null) ?? null,
    updated_at: String(row.updated_at ?? ""),
    published_by: (row.published_by as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
  };
}

/** Load one version with every child row, shaped for computeBundle(). */
export async function loadBundle(versionId: string): Promise<StdCostBundle | null> {
  const db = supabaseAdmin;

  const { data: versionRow, error: versionError } = await db
    .from("std_cost_versions")
    .select(VERSION_COLUMNS)
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) throw new Error(`Failed to load version: ${versionError.message}`);
  if (!versionRow) return null;

  const [rmResult, btResult, fixedResult] = await Promise.all([
    db
      .from("std_cost_rm_prices")
      .select(
        "id, rm_key, display_name, purchase_amount, purchase_unit_label, purchase_unit_kg, needs_verification, verification_note",
      )
      .eq("version_id", versionId)
      .order("rm_key"),
    db
      .from("std_cost_brick_types")
      .select(
        "id, brick_type, odoo_product_match, bricks_per_batch, labor_cost_per_batch, electricity_per_unit, depreciation_per_unit, sales_price, loading_unloading_per_unit, transport_per_unit, commission_per_unit, sort_order",
      )
      .eq("version_id", versionId)
      .order("sort_order")
      .order("brick_type"),
    db
      .from("std_cost_fixed_items")
      .select("id, item_key, display_name, monthly_amount")
      .eq("version_id", versionId)
      .order("item_key"),
  ]);

  if (rmResult.error) throw new Error(`Failed to load raw materials: ${rmResult.error.message}`);
  if (btResult.error) throw new Error(`Failed to load brick types: ${btResult.error.message}`);
  if (fixedResult.error) throw new Error(`Failed to load fixed costs: ${fixedResult.error.message}`);

  const brickTypeIds = (btResult.data ?? []).map((row) => String(row.id));
  const recipeByBrickType = new Map<string, { rm_key: string; kg_per_batch: number }[]>();
  if (brickTypeIds.length > 0) {
    const { data: recipeRows, error: recipeError } = await db
      .from("std_cost_recipe_lines")
      .select("brick_type_id, rm_key, kg_per_batch")
      .in("brick_type_id", brickTypeIds)
      .order("rm_key");
    if (recipeError) throw new Error(`Failed to load recipes: ${recipeError.message}`);
    for (const row of recipeRows ?? []) {
      const key = String(row.brick_type_id);
      const lines = recipeByBrickType.get(key) ?? [];
      lines.push({ rm_key: String(row.rm_key), kg_per_batch: num(row.kg_per_batch) });
      recipeByBrickType.set(key, lines);
    }
  }

  const rm_prices: StdCostRmPrice[] = (rmResult.data ?? []).map((row) => ({
    id: String(row.id),
    rm_key: String(row.rm_key),
    display_name: String(row.display_name),
    purchase_amount: num(row.purchase_amount),
    purchase_unit_label: String(row.purchase_unit_label),
    purchase_unit_kg: num(row.purchase_unit_kg),
    needs_verification: row.needs_verification === true,
    verification_note: (row.verification_note as string | null) ?? null,
  }));

  const brick_types: StdCostBrickType[] = (btResult.data ?? []).map((row) => ({
    id: String(row.id),
    brick_type: String(row.brick_type),
    odoo_product_match: String(row.odoo_product_match),
    bricks_per_batch: num(row.bricks_per_batch),
    labor_cost_per_batch: num(row.labor_cost_per_batch),
    electricity_per_unit: num(row.electricity_per_unit),
    depreciation_per_unit: num(row.depreciation_per_unit),
    sales_price: nullableNum(row.sales_price),
    loading_unloading_per_unit: num(row.loading_unloading_per_unit),
    transport_per_unit: num(row.transport_per_unit),
    commission_per_unit: num(row.commission_per_unit),
    sort_order: num(row.sort_order),
    recipe: recipeByBrickType.get(String(row.id)) ?? [],
  }));

  const fixed_items: StdCostFixedItem[] = (fixedResult.data ?? []).map((row) => ({
    id: String(row.id),
    item_key: String(row.item_key),
    display_name: String(row.display_name),
    monthly_amount: num(row.monthly_amount),
  }));

  return { version: toVersion(versionRow), rm_prices, brick_types, fixed_items };
}

/** The single open draft, or null when the module has never been seeded. */
export async function loadDraftBundle(): Promise<StdCostBundle | null> {
  const { data, error } = await supabaseAdmin
    .from("std_cost_versions")
    .select("id")
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw new Error(`Failed to find the draft: ${error.message}`);
  if (!data) return null;
  return loadBundle(String(data.id));
}

/** The version the Intelligence Layer is currently reading (latest valid_from). */
export async function loadCurrentPublishedBundle(): Promise<StdCostBundle | null> {
  const { data, error } = await supabaseAdmin
    .from("std_cost_versions")
    .select("id")
    .eq("status", "published")
    .order("valid_from", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to find the published version: ${error.message}`);
  if (!data) return null;
  return loadBundle(String(data.id));
}

/** Published history, newest standard first. */
export async function listPublishedVersions(limit = 50): Promise<StdCostVersionSummary[]> {
  const db = supabaseAdmin;
  const { data, error } = await db
    .from("std_cost_versions")
    .select(VERSION_COLUMNS)
    .eq("status", "published")
    .order("valid_from", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load history: ${error.message}`);

  const rows = (data ?? []).map(toVersion);
  const publisherIds = Array.from(
    new Set(rows.map((row) => row.published_by).filter((id): id is string => !!id)),
  );

  const nameById = new Map<string, string>();
  if (publisherIds.length > 0) {
    const { data: users } = await db.from("users").select("id, name").in("id", publisherIds);
    for (const user of users ?? []) nameById.set(String(user.id), String(user.name ?? ""));
  }

  return rows.map((row) => ({
    ...row,
    published_by_name: row.published_by ? (nameById.get(row.published_by) ?? null) : null,
  }));
}

/**
 * Replace the draft's contents wholesale.
 *
 * Replace-all rather than per-field patching: the editor always holds the
 * complete picture, and it keeps "what the user sees" and "what is stored"
 * impossible to drift apart. The database triggers refuse the write outright
 * if the target version is not a draft.
 */
export async function saveDraft(
  payload: StdCostDraftPayload,
  userId: string,
): Promise<StdCostBundle> {
  const db = supabaseAdmin;

  const { data: versionRow, error: versionError } = await db
    .from("std_cost_versions")
    .select("id, status")
    .eq("id", payload.version_id)
    .maybeSingle();
  if (versionError) throw new Error(`Failed to load the draft: ${versionError.message}`);
  if (!versionRow) throw new StdCostError("Draft not found", 404);
  if (versionRow.status !== "draft") {
    throw new StdCostError("That version is published and cannot be edited", 409);
  }

  const versionId = payload.version_id;

  const { error: updateError } = await db
    .from("std_cost_versions")
    .update({
      monthly_production_basis: payload.monthly_production_basis,
      notes: payload.notes ?? null,
      updated_by: userId,
    })
    .eq("id", versionId);
  if (updateError) throw new Error(`Failed to save the draft: ${updateError.message}`);

  // Children are replaced as a set. ON DELETE CASCADE removes recipe lines
  // with their brick types, so the recipe is re-inserted with fresh ids.
  await deleteChildren(versionId);

  if (payload.rm_prices.length > 0) {
    const { error } = await db.from("std_cost_rm_prices").insert(
      payload.rm_prices.map((rm) => ({ version_id: versionId, ...rm })),
    );
    if (error) throw new Error(`Failed to save raw materials: ${error.message}`);
  }

  if (payload.fixed_items.length > 0) {
    const { error } = await db.from("std_cost_fixed_items").insert(
      payload.fixed_items.map((item) => ({ version_id: versionId, ...item })),
    );
    if (error) throw new Error(`Failed to save fixed costs: ${error.message}`);
  }

  if (payload.brick_types.length > 0) {
    const { data: inserted, error } = await db
      .from("std_cost_brick_types")
      .insert(
        payload.brick_types.map((bt, index) => ({
          version_id: versionId,
          brick_type: bt.brick_type,
          odoo_product_match: bt.odoo_product_match,
          bricks_per_batch: bt.bricks_per_batch,
          labor_cost_per_batch: bt.labor_cost_per_batch,
          electricity_per_unit: bt.electricity_per_unit,
          depreciation_per_unit: bt.depreciation_per_unit,
          sales_price: bt.sales_price,
          loading_unloading_per_unit: bt.loading_unloading_per_unit,
          transport_per_unit: bt.transport_per_unit,
          commission_per_unit: bt.commission_per_unit,
          sort_order: bt.sort_order ?? index,
        })),
      )
      .select("id, brick_type");
    if (error) throw new Error(`Failed to save brick types: ${error.message}`);

    const idByType = new Map((inserted ?? []).map((row) => [String(row.brick_type), String(row.id)]));
    const recipeRows = payload.brick_types.flatMap((bt) => {
      const brickTypeId = idByType.get(bt.brick_type);
      if (!brickTypeId) return [];
      return bt.recipe.map((line) => ({
        brick_type_id: brickTypeId,
        rm_key: line.rm_key,
        kg_per_batch: line.kg_per_batch,
      }));
    });
    if (recipeRows.length > 0) {
      const { error: recipeError } = await db.from("std_cost_recipe_lines").insert(recipeRows);
      if (recipeError) throw new Error(`Failed to save recipes: ${recipeError.message}`);
    }
  }

  const bundle = await loadBundle(versionId);
  if (!bundle) throw new Error("Draft disappeared while saving");
  return bundle;
}

async function deleteChildren(versionId: string): Promise<void> {
  const db = supabaseAdmin;
  const results = await Promise.all([
    db.from("std_cost_rm_prices").delete().eq("version_id", versionId),
    db.from("std_cost_fixed_items").delete().eq("version_id", versionId),
    db.from("std_cost_brick_types").delete().eq("version_id", versionId),
  ]);
  for (const result of results) {
    if (result.error) throw new Error(`Failed to clear the draft: ${result.error.message}`);
  }
}

/**
 * Publish the draft. The whole transition (freeze this version, open the next
 * draft as a copy) happens inside publish_std_cost_draft() so there is never a
 * moment with two drafts or none.
 */
export async function publishDraft(args: {
  versionId: string;
  validFrom: string;
  publishedBy: string;
  notes?: string | null;
}): Promise<{ published_version_id: string; new_draft_id: string }> {
  const { data, error } = await supabaseAdmin.rpc("publish_std_cost_draft", {
    p_draft_id: args.versionId,
    p_valid_from: args.validFrom,
    p_published_by: args.publishedBy,
    p_notes: args.notes ?? null,
  });
  if (error) throw new StdCostError(error.message, 409);
  return { published_version_id: args.versionId, new_draft_id: String(data) };
}

/**
 * Revert: refill the open draft from an older published version. The old
 * version stays exactly where it is — reverting produces a new draft that Ram
 * then publishes, so history is never rewritten.
 */
export async function useVersionAsDraft(
  sourceVersionId: string,
  userId: string,
): Promise<StdCostBundle> {
  const source = await loadBundle(sourceVersionId);
  if (!source) throw new StdCostError("Version not found", 404);

  const draft = await loadDraftBundle();
  if (!draft) throw new StdCostError("No open draft to fill", 409);

  return saveDraft(
    {
      version_id: draft.version.id,
      monthly_production_basis: source.version.monthly_production_basis,
      notes: `Reverted from the standard valid from ${source.version.valid_from ?? "?"}`,
      rm_prices: source.rm_prices.map(({ id: _id, ...rest }) => rest),
      fixed_items: source.fixed_items.map(({ id: _id, ...rest }) => rest),
      brick_types: source.brick_types.map(({ id: _id, ...rest }) => rest),
    },
    userId,
  );
}

/** An error with an HTTP status the route can pass straight through. */
export class StdCostError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "StdCostError";
    this.status = status;
  }
}

// ==========================================================================
// Reference (benchmark) costs.
//
// Deliberately a separate read path from loadBundle(): nothing that computes a
// standard cost may so much as see a reference. The only place the two meet is
// computeAllReferenceVariances(), which subtracts and reports — it cannot feed
// anything back.
// ==========================================================================

/** All benchmarks, newest first. Inactive ones included — history matters. */
export async function listReferences(): Promise<StdCostReference[]> {
  const db = supabaseAdmin;

  const { data, error } = await db
    .from("std_cost_reference_costs")
    .select(
      "id, brick_type, reference_cost, source, source_label, reference_date, notes, is_active, breakdown_status",
    )
    .order("brick_type")
    .order("reference_date", { ascending: false });
  if (error) throw new Error(`Failed to load reference costs: ${error.message}`);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: componentRows, error: componentError } = await db
    .from("std_cost_reference_components")
    .select("id, reference_cost_id, component_kind, component_key, amount")
    .in(
      "reference_cost_id",
      rows.map((row) => String(row.id)),
    );
  if (componentError) {
    throw new Error(`Failed to load reference components: ${componentError.message}`);
  }

  const componentsByReference = new Map<string, StdCostReference["components"]>();
  for (const row of componentRows ?? []) {
    const key = String(row.reference_cost_id);
    const list = componentsByReference.get(key) ?? [];
    list.push({
      id: String(row.id),
      component_kind: row.component_kind as "cost_element" | "raw_material",
      component_key: String(row.component_key),
      amount: num(row.amount),
    });
    componentsByReference.set(key, list);
  }

  return rows.map((row) => ({
    id: String(row.id),
    brick_type: String(row.brick_type),
    reference_cost: num(row.reference_cost),
    source: row.source as StdCostReference["source"],
    source_label: (row.source_label as string | null) ?? null,
    reference_date: String(row.reference_date),
    notes: (row.notes as string | null) ?? null,
    is_active: row.is_active !== false,
    breakdown_status: (row.breakdown_status as "partial" | "complete") ?? "partial",
    components: componentsByReference.get(String(row.id)) ?? [],
  }));
}

/** Create or update one benchmark, replacing its component breakdown. */
export async function saveReference(
  payload: StdCostReferencePayload,
  userId: string,
): Promise<StdCostReference> {
  const db = supabaseAdmin;

  const row = {
    brick_type: payload.brick_type,
    reference_cost: payload.reference_cost,
    source: payload.source,
    source_label: payload.source_label ?? null,
    reference_date: payload.reference_date,
    notes: payload.notes ?? null,
    is_active: payload.is_active ?? true,
    // Default partial: a breakdown is incomplete until someone says otherwise,
    // and only a complete one is required to balance.
    breakdown_status: payload.breakdown_status ?? "partial",
    updated_by: userId,
  };

  let referenceId = payload.id ?? null;

  if (referenceId) {
    const { error } = await db.from("std_cost_reference_costs").update(row).eq("id", referenceId);
    if (error) throw new StdCostError(`Failed to update the reference: ${error.message}`, 422);
  } else {
    const { data, error } = await db
      .from("std_cost_reference_costs")
      .insert({ ...row, created_by: userId })
      .select("id")
      .single();
    if (error) {
      // The unique key is (brick_type, source, reference_date) — say so plainly.
      const duplicate = error.code === "23505";
      throw new StdCostError(
        duplicate
          ? `A ${payload.source} reference for ${payload.brick_type} on ${payload.reference_date} already exists`
          : `Failed to save the reference: ${error.message}`,
        422,
      );
    }
    referenceId = String(data.id);
  }

  const { error: deleteError } = await db
    .from("std_cost_reference_components")
    .delete()
    .eq("reference_cost_id", referenceId);
  if (deleteError) {
    throw new Error(`Failed to clear the old breakdown: ${deleteError.message}`);
  }

  const components = payload.components ?? [];
  if (components.length > 0) {
    const { error } = await db
      .from("std_cost_reference_components")
      .insert(components.map((component) => ({ reference_cost_id: referenceId, ...component })));
    if (error) throw new StdCostError(`Failed to save the breakdown: ${error.message}`, 422);
  }

  const saved = (await listReferences()).find((reference) => reference.id === referenceId);
  if (!saved) throw new Error("Reference disappeared while saving");
  return saved;
}

/**
 * Deactivate a benchmark. Never a hard delete: a legacy number that has been
 * argued over is part of the audit trail, and "we stopped comparing against it"
 * is different from "it never existed".
 */
export async function deactivateReference(referenceId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("std_cost_reference_costs")
    .update({ is_active: false, updated_by: userId })
    .eq("id", referenceId);
  if (error) throw new Error(`Failed to deactivate the reference: ${error.message}`);
}
