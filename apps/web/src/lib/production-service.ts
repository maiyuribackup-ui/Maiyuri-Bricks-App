/**
 * Production Module Service
 * Handles integration between Maiyuri Bricks app and Odoo MRP module
 * Including finished goods, BOMs, manufacturing orders, and employee attendance
 */

import { createClient } from "@supabase/supabase-js";
import type {
  FinishedGood,
  RawMaterial,
  BOMLine,
  Employee,
  ProductionOrder,
  ProductionShift,
  ProductionAttendance,
  ProductionConsumptionLine,
  OdooBOM,
  OdooBOMLine,
  OdooEmployee,
  OdooProduct,
  CreateProductionOrderInput,
  ProductionOrderFilters,
} from "@maiyuri/shared";

// Odoo connection config
const ODOO_CONFIG = {
  url: process.env.ODOO_URL || "https://CRM.MAIYURI.COM",
  db: process.env.ODOO_DB || "lite2",
  username: process.env.ODOO_USER || "maiyuribricks@gmail.com",
  password: process.env.ODOO_PASSWORD || "",
};

// Lazy Supabase client for server-side operations
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface SyncResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// XML-RPC Helper Functions (reused from odoo-service.ts pattern)
// ============================================================================

async function odooXmlRpc(
  endpoint: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const xmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>
    ${params.map((p) => `<param><value>${formatXmlValue(p)}</value></param>`).join("\n    ")}
  </params>
</methodCall>`;

  const response = await fetch(`${ODOO_CONFIG.url}/xmlrpc/2/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xmlBody,
  });

  const text = await response.text();
  return parseXmlResponse(text);
}

function formatXmlValue(value: unknown): string {
  if (typeof value === "string") return `<string>${escapeXml(value)}</string>`;
  if (typeof value === "number")
    return Number.isInteger(value)
      ? `<int>${value}</int>`
      : `<double>${value}</double>`;
  if (typeof value === "boolean") return `<boolean>${value ? 1 : 0}</boolean>`;
  if (Array.isArray(value)) {
    return `<array><data>${value.map((v) => `<value>${formatXmlValue(v)}</value>`).join("")}</data></array>`;
  }
  if (typeof value === "object" && value !== null) {
    const members = Object.entries(value)
      .map(
        ([k, v]) =>
          `<member><name>${k}</name><value>${formatXmlValue(v)}</value></member>`,
      )
      .join("");
    return `<struct>${members}</struct>`;
  }
  return "<nil/>";
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseXmlResponse(xml: string): unknown {
  if (xml.includes("<fault>")) {
    const faultString = xml.match(
      /<name>faultString<\/name>\s*<value>(?:<string>)?(.*?)(?:<\/string>)?<\/value>/s,
    );
    throw new Error(`Odoo Error: ${faultString?.[1] || "Unknown error"}`);
  }

  const paramMatch = xml.match(
    /<params>\s*<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>\s*<\/params>/,
  );
  if (paramMatch) {
    return parseValue(paramMatch[1]);
  }

  return parseValue(xml);
}

function extractTagContent(
  xml: string,
  tagName: string,
  startPos: number = 0,
): { content: string; endPos: number } | null {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  const openPos = xml.indexOf(openTag, startPos);
  if (openPos === -1) return null;

  const contentStart = openPos + openTag.length;
  let depth = 1;
  let pos = contentStart;

  while (depth > 0 && pos < xml.length) {
    const nextOpen = xml.indexOf(openTag, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) {
        return {
          content: xml.substring(contentStart, nextClose),
          endPos: nextClose + closeTag.length,
        };
      }
      pos = nextClose + closeTag.length;
    }
  }

  return null;
}

function extractValues(xml: string): string[] {
  const values: string[] = [];
  let pos = 0;

  while (pos < xml.length) {
    const result = extractTagContent(xml, "value", pos);
    if (!result) break;
    values.push(result.content);
    pos = result.endPos;
  }

  return values;
}

function parseValue(xml: string): unknown {
  xml = xml.trim();

  const intMatch = xml.match(/^<i(?:nt|4)>(-?\d+)<\/i(?:nt|4)>$/);
  if (intMatch) return parseInt(intMatch[1], 10);

  const doubleMatch = xml.match(/^<double>(-?[\d.]+)<\/double>$/);
  if (doubleMatch) return parseFloat(doubleMatch[1]);

  const boolMatch = xml.match(/^<boolean>(\d)<\/boolean>$/);
  if (boolMatch) return boolMatch[1] === "1";

  const stringMatch = xml.match(/^<string>([\s\S]*?)<\/string>$/);
  if (stringMatch) return unescapeXml(stringMatch[1]);

  if (xml.match(/^<nil\s*\/>$/) || xml === "False" || xml === "") return null;

  const arrayMatch = xml.match(
    /^<array>\s*<data>([\s\S]*)<\/data>\s*<\/array>$/,
  );
  if (arrayMatch) {
    const values = extractValues(arrayMatch[1]);
    return values.map((v) => parseValue(v));
  }

  const structMatch = xml.match(/^<struct>([\s\S]*)<\/struct>$/);
  if (structMatch) {
    const obj: Record<string, unknown> = {};
    const memberContent = structMatch[1];

    let pos = 0;
    while (pos < memberContent.length) {
      const memberStart = memberContent.indexOf("<member>", pos);
      if (memberStart === -1) break;

      const memberEnd = findMatchingClose(memberContent, "member", memberStart);
      if (memberEnd === -1) break;

      const member = memberContent.substring(memberStart + 8, memberEnd);

      const nameMatch = member.match(/<name>([^<]+)<\/name>/);
      if (nameMatch) {
        const valueResult = extractTagContent(member, "value", 0);
        if (valueResult) {
          obj[nameMatch[1]] = parseValue(valueResult.content);
        }
      }

      pos = memberEnd + 9;
    }
    return obj;
  }

  if (/^-?\d+$/.test(xml)) {
    return parseInt(xml, 10);
  }

  return xml;
}

function findMatchingClose(
  xml: string,
  tagName: string,
  startPos: number,
): number {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  let depth = 1;
  let pos = startPos + openTag.length;

  while (pos < xml.length) {
    const nextOpen = xml.indexOf(openTag, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) {
        return nextClose;
      }
      pos = nextClose + closeTag.length;
    }
  }

  return -1;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function authenticate(): Promise<number> {
  const uid = await odooXmlRpc("common", "authenticate", [
    ODOO_CONFIG.db,
    ODOO_CONFIG.username,
    ODOO_CONFIG.password,
    {},
  ]);

  if (!uid || uid === false) {
    throw new Error("Odoo authentication failed");
  }

  return uid as number;
}

async function execute(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  const uid = await authenticate();

  return odooXmlRpc("object", "execute_kw", [
    ODOO_CONFIG.db,
    uid,
    ODOO_CONFIG.password,
    model,
    method,
    args,
    kwargs,
  ]);
}

// ============================================================================
// Finished Goods Sync (from Odoo product.product)
// ============================================================================

/**
 * Sync finished goods from Odoo
 * Filters products by category "Finished Good"
 */
export async function syncFinishedGoodsFromOdoo(): Promise<SyncResult> {
  try {
    // First, get the Finished Good category ID
    const categories = (await execute(
      "product.category",
      "search_read",
      [[["name", "ilike", "Finished Good"]]],
      { fields: ["id", "name"], limit: 5 },
    )) as Array<{ id: number; name: string }>;

    const finishedGoodCatIds = categories.map((c) => c.id);

    if (finishedGoodCatIds.length === 0) {
      return {
        success: false,
        message: "Finished Good category not found in Odoo",
      };
    }

    // Fetch products in Finished Good category
    const products = (await execute(
      "product.product",
      "search_read",
      [
        [
          ["categ_id", "in", finishedGoodCatIds],
          ["active", "=", true],
        ],
      ],
      {
        fields: ["id", "name", "default_code", "uom_id", "categ_id"],
        limit: 100,
      },
    )) as OdooProduct[];

    const supabase = getSupabase();
    let synced = 0;
    let failed = 0;

    for (const product of products) {
      try {
        // Get BOM for this product
        const boms = (await execute(
          "mrp.bom",
          "search_read",
          [[["product_tmpl_id.product_variant_ids", "=", product.id]]],
          { fields: ["id", "product_qty"], limit: 1 },
        )) as OdooBOM[];

        const bom = boms[0] ?? null;

        // Upsert to Supabase
        const { error } = await supabase.from("finished_goods").upsert(
          {
            odoo_product_id: product.id,
            name: product.name,
            internal_reference: product.default_code ?? null,
            category: "Finished Good",
            uom_id: Array.isArray(product.uom_id) ? product.uom_id[0] : null,
            uom_name: Array.isArray(product.uom_id) ? product.uom_id[1] : null,
            bom_id: bom?.id ?? null,
            bom_quantity: bom?.product_qty ?? null,
            is_active: true,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "odoo_product_id" },
        );

        if (error) {
          console.error(`Failed to upsert product ${product.name}:`, error);
          failed++;
        } else {
          synced++;
        }
      } catch (err) {
        console.error(`Error processing product ${product.name}:`, err);
        failed++;
      }
    }

    // Log sync
    await supabase.from("production_sync_log").insert({
      sync_type: "product_sync",
      status: failed === 0 ? "success" : "error",
      odoo_response: { total: products.length, synced, failed },
      error_message: failed > 0 ? `${failed} products failed to sync` : null,
    });

    return {
      success: failed === 0,
      message: `Synced ${synced}/${products.length} finished goods`,
      data: { total: products.length, synced, failed },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to sync finished goods",
      error: errorMessage,
    };
  }
}

/**
 * Get all active finished goods from Supabase
 */
export async function getFinishedGoods(): Promise<FinishedGood[]> {
  const { data, error } = await getSupabase()
    .from("finished_goods")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// BOM Sync (from Odoo mrp.bom and mrp.bom.line)
// ============================================================================

/**
 * Fetch and sync BOM lines for a finished good
 */
export async function fetchBOMFromOdoo(
  finishedGoodId: string,
): Promise<SyncResult> {
  try {
    const supabase = getSupabase();

    // Get the finished good
    const { data: fg, error: fgError } = await supabase
      .from("finished_goods")
      .select("*")
      .eq("id", finishedGoodId)
      .single();

    if (fgError || !fg) {
      return { success: false, message: "Finished good not found" };
    }

    if (!fg.bom_id) {
      return {
        success: false,
        message: "No BOM configured for this product in Odoo",
      };
    }

    // Fetch BOM lines from Odoo
    const bomLines = (await execute(
      "mrp.bom.line",
      "search_read",
      [[["bom_id", "=", fg.bom_id]]],
      {
        fields: [
          "id",
          "product_id",
          "product_qty",
          "product_uom_id",
          "sequence",
        ],
      },
    )) as OdooBOMLine[];

    if (!bomLines || bomLines.length === 0) {
      return { success: false, message: "No BOM lines found" };
    }

    // First, sync raw materials
    for (const line of bomLines) {
      const productId = Array.isArray(line.product_id)
        ? line.product_id[0]
        : line.product_id;
      const productName = Array.isArray(line.product_id)
        ? line.product_id[1]
        : "Unknown";

      await supabase.from("raw_materials").upsert(
        {
          odoo_product_id: productId,
          name: productName,
          category: "Raw Material",
          uom_id: Array.isArray(line.product_uom_id)
            ? line.product_uom_id[0]
            : null,
          uom_name: Array.isArray(line.product_uom_id)
            ? line.product_uom_id[1]
            : null,
          is_active: true,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "odoo_product_id" },
      );
    }

    // Now sync BOM lines
    // First delete existing lines for this finished good
    await supabase
      .from("bom_lines")
      .delete()
      .eq("finished_good_id", finishedGoodId);

    // Insert new BOM lines
    for (const line of bomLines) {
      const productId = Array.isArray(line.product_id)
        ? line.product_id[0]
        : line.product_id;

      // Get the raw material ID
      const { data: rm } = await supabase
        .from("raw_materials")
        .select("id")
        .eq("odoo_product_id", productId)
        .single();

      if (rm) {
        await supabase.from("bom_lines").insert({
          finished_good_id: finishedGoodId,
          raw_material_id: rm.id,
          odoo_bom_line_id: line.id,
          quantity_per_bom: line.product_qty,
          uom_name: Array.isArray(line.product_uom_id)
            ? line.product_uom_id[1]
            : null,
          sort_order: line.sequence ?? 0,
        });
      }
    }

    // Log sync
    await supabase.from("production_sync_log").insert({
      sync_type: "bom_sync",
      status: "success",
      odoo_response: { bom_id: fg.bom_id, lines_count: bomLines.length },
    });

    return {
      success: true,
      message: `Synced ${bomLines.length} BOM lines`,
      data: { bom_id: fg.bom_id, lines_count: bomLines.length },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to fetch BOM",
      error: errorMessage,
    };
  }
}

/**
 * Get BOM lines for a finished good
 */
export async function getBOMLines(finishedGoodId: string): Promise<BOMLine[]> {
  const { data, error } = await getSupabase()
    .from("bom_lines")
    .select(
      `
      *,
      raw_material:raw_materials(*)
    `,
    )
    .eq("finished_good_id", finishedGoodId)
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// Employee Sync (from Odoo hr.employee)
// ============================================================================

/**
 * Sync employees from Odoo
 * Optionally filter by department (e.g., "Factory")
 */
export async function syncEmployeesFromOdoo(
  department?: string,
): Promise<SyncResult> {
  try {
    const domain: unknown[][] = [["active", "=", true]];
    if (department) {
      domain.push(["department_id.name", "ilike", department]);
    }

    const employees = (await execute("hr.employee", "search_read", [domain], {
      fields: ["id", "name", "department_id", "job_id", "work_email"],
      limit: 100,
    })) as OdooEmployee[];

    const supabase = getSupabase();
    let synced = 0;
    let failed = 0;

    for (const emp of employees) {
      try {
        const { error } = await supabase.from("employees").upsert(
          {
            odoo_employee_id: emp.id,
            name: emp.name,
            department: Array.isArray(emp.department_id)
              ? emp.department_id[1]
              : null,
            job_title: Array.isArray(emp.job_id) ? emp.job_id[1] : null,
            work_email: emp.work_email ?? null,
            is_active: true,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "odoo_employee_id" },
        );

        if (error) {
          console.error(`Failed to upsert employee ${emp.name}:`, error);
          failed++;
        } else {
          synced++;
        }
      } catch (err) {
        console.error(`Error processing employee ${emp.name}:`, err);
        failed++;
      }
    }

    // Log sync
    await supabase.from("production_sync_log").insert({
      sync_type: "employee_sync",
      status: failed === 0 ? "success" : "error",
      odoo_response: { total: employees.length, synced, failed },
      error_message: failed > 0 ? `${failed} employees failed to sync` : null,
    });

    return {
      success: failed === 0,
      message: `Synced ${synced}/${employees.length} employees`,
      data: { total: employees.length, synced, failed },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to sync employees",
      error: errorMessage,
    };
  }
}

/**
 * Get all active employees from Supabase
 */
export async function getEmployees(department?: string): Promise<Employee[]> {
  let query = getSupabase()
    .from("employees")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (department) {
    query = query.eq("department", department);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// Production Orders
// ============================================================================

/**
 * Calculate expected consumption quantities based on BOM
 * Formula: (plannedQty / bomQty) * lineQty
 */
export function calculateExpectedConsumption(
  plannedQuantity: number,
  bomQuantity: number,
  bomLines: BOMLine[],
): Array<{
  raw_material_id: string;
  expected_quantity: number;
  uom_name: string | null;
}> {
  const multiplier = plannedQuantity / bomQuantity;

  return bomLines.map((line) => ({
    raw_material_id: line.raw_material_id,
    expected_quantity:
      Math.round(line.quantity_per_bom * multiplier * 10000) / 10000,
    uom_name: line.uom_name,
  }));
}

/**
 * Create a new production order
 */
export async function createProductionOrder(
  input: CreateProductionOrderInput,
  userId: string,
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const supabase = getSupabase();

    // Create the production order
    const { data: order, error: orderError } = await supabase
      .from("production_orders")
      .insert({
        finished_good_id: input.finished_good_id,
        planned_quantity: input.planned_quantity,
        scheduled_date: input.scheduled_date,
        status: "draft",
        notes: input.notes ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (orderError || !order) {
      return {
        success: false,
        error: orderError?.message ?? "Failed to create order",
      };
    }

    // Create consumption lines
    for (const line of input.consumption_lines) {
      await supabase.from("production_consumption_lines").insert({
        production_order_id: order.id,
        raw_material_id: line.raw_material_id,
        expected_quantity: line.expected_quantity,
        actual_quantity: line.actual_quantity ?? null,
        uom_name: line.uom_name ?? null,
        sort_order: line.sort_order ?? 0,
        notes: line.notes ?? null,
      });
    }

    // Create shifts if provided
    if (input.shifts && input.shifts.length > 0) {
      for (const shiftInput of input.shifts) {
        const { data: shift, error: shiftError } = await supabase
          .from("production_shifts")
          .insert({
            production_order_id: order.id,
            shift_date: shiftInput.shift_date,
            start_time: shiftInput.start_time,
            end_time: shiftInput.end_time ?? null,
            notes: shiftInput.notes ?? null,
          })
          .select()
          .single();

        if (shiftError || !shift) {
          console.error("Failed to create shift:", shiftError);
          continue;
        }

        // Create attendance records for each employee
        for (const employeeId of shiftInput.employee_ids) {
          await supabase.from("production_attendance").insert({
            shift_id: shift.id,
            employee_id: employeeId,
            check_in: shiftInput.start_time,
            check_out: shiftInput.end_time ?? null,
          });
        }
      }
    }

    return { success: true, orderId: order.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Get production orders with filters
 */
export async function getProductionOrders(
  filters?: ProductionOrderFilters,
): Promise<ProductionOrder[]> {
  let query = getSupabase()
    .from("production_orders")
    .select(
      `
      *,
      finished_good:finished_goods(*),
      shifts:production_shifts(
        *,
        attendance:production_attendance(
          *,
          employee:employees(*)
        )
      ),
      consumption_lines:production_consumption_lines(
        *,
        raw_material:raw_materials(*)
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.finished_good_id) {
    query = query.eq("finished_good_id", filters.finished_good_id);
  }
  if (filters?.from_date) {
    query = query.gte("scheduled_date", filters.from_date);
  }
  if (filters?.to_date) {
    query = query.lte("scheduled_date", filters.to_date);
  }
  if (filters?.odoo_sync_status) {
    query = query.eq("odoo_sync_status", filters.odoo_sync_status);
  }
  if (filters?.search) {
    query = query.ilike("order_number", `%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Get a single production order by ID
 */
export async function getProductionOrder(
  orderId: string,
): Promise<ProductionOrder | null> {
  const { data, error } = await getSupabase()
    .from("production_orders")
    .select(
      `
      *,
      finished_good:finished_goods(*),
      shifts:production_shifts(
        *,
        attendance:production_attendance(
          *,
          employee:employees(*)
        )
      ),
      consumption_lines:production_consumption_lines(
        *,
        raw_material:raw_materials(*)
      )
    `,
    )
    .eq("id", orderId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update consumption line actual quantity
 */
export async function updateConsumptionLine(
  lineId: string,
  actualQuantity: number,
  notes?: string,
): Promise<SyncResult> {
  const { error } = await getSupabase()
    .from("production_consumption_lines")
    .update({
      actual_quantity: actualQuantity,
      notes: notes ?? null,
    })
    .eq("id", lineId);

  if (error) {
    return {
      success: false,
      message: "Failed to update consumption",
      error: error.message,
    };
  }

  return { success: true, message: "Consumption updated" };
}

// ============================================================================
// Odoo MRP Integration - Manufacturing Order
// ============================================================================

/**
 * Create a Manufacturing Order in Odoo
 */
export async function createManufacturingOrderInOdoo(
  orderId: string,
): Promise<SyncResult> {
  try {
    const supabase = getSupabase();

    // Get the production order with all related data
    const order = await getProductionOrder(orderId);
    if (!order) {
      return { success: false, message: "Production order not found" };
    }

    const fg = order.finished_good as FinishedGood | undefined;
    if (!fg?.odoo_product_id) {
      return { success: false, message: "Finished good not linked to Odoo" };
    }

    // Get default picking type and locations for MRP
    const pickingTypes = (await execute(
      "stock.picking.type",
      "search_read",
      [[["code", "=", "mrp_operation"]]],
      {
        fields: ["id", "default_location_src_id", "default_location_dest_id"],
        limit: 1,
      },
    )) as Array<{
      id: number;
      default_location_src_id: [number, string] | false;
      default_location_dest_id: [number, string] | false;
    }>;

    if (!pickingTypes || pickingTypes.length === 0) {
      return { success: false, message: "MRP picking type not found in Odoo" };
    }

    const pickingType = pickingTypes[0];
    const srcLocationId = Array.isArray(pickingType.default_location_src_id)
      ? pickingType.default_location_src_id[0]
      : null;
    const destLocationId = Array.isArray(pickingType.default_location_dest_id)
      ? pickingType.default_location_dest_id[0]
      : null;

    // Get UoM ID for the product
    const products = (await execute(
      "product.product",
      "read",
      [[fg.odoo_product_id]],
      { fields: ["uom_id"] },
    )) as Array<{ id: number; uom_id: [number, string] | false }>;

    const uomId = products[0]?.uom_id
      ? Array.isArray(products[0].uom_id)
        ? products[0].uom_id[0]
        : null
      : null;

    // Create the Manufacturing Order
    const moData: Record<string, unknown> = {
      product_id: fg.odoo_product_id,
      product_qty: order.planned_quantity,
      product_uom_id: uomId,
      bom_id: fg.bom_id,
      date_start: order.scheduled_date,
      picking_type_id: pickingType.id,
    };

    if (srcLocationId) moData.location_src_id = srcLocationId;
    if (destLocationId) moData.location_dest_id = destLocationId;

    const odooMoId = (await execute("mrp.production", "create", [
      moData,
    ])) as number;

    // Update local record with Odoo MO ID
    await supabase
      .from("production_orders")
      .update({
        odoo_production_id: odooMoId,
        odoo_sync_status: "synced",
        odoo_synced_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    // Log sync
    await supabase.from("production_sync_log").insert({
      production_order_id: orderId,
      sync_type: "mo_create",
      status: "success",
      odoo_response: { odoo_production_id: odooMoId },
    });

    return {
      success: true,
      message: `Manufacturing Order created in Odoo (ID: ${odooMoId})`,
      data: { odooProductionId: odooMoId },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await getSupabase()
      .from("production_orders")
      .update({
        odoo_sync_status: "error",
        odoo_error_message: errorMessage,
      })
      .eq("id", orderId);

    await getSupabase().from("production_sync_log").insert({
      production_order_id: orderId,
      sync_type: "mo_create",
      status: "error",
      error_message: errorMessage,
    });

    return {
      success: false,
      message: "Failed to create MO in Odoo",
      error: errorMessage,
    };
  }
}

// ============================================================================
// Odoo Attendance Integration
// ============================================================================

/**
 * Create attendance record in Odoo hr.attendance
 */
export async function createAttendanceInOdoo(
  attendanceId: string,
): Promise<SyncResult> {
  try {
    const supabase = getSupabase();

    // Get attendance with employee data
    const { data: attendance, error } = await supabase
      .from("production_attendance")
      .select(
        `
        *,
        employee:employees(*)
      `,
      )
      .eq("id", attendanceId)
      .single();

    if (error || !attendance) {
      return { success: false, message: "Attendance record not found" };
    }

    const employee = attendance.employee as Employee | undefined;
    if (!employee?.odoo_employee_id) {
      return { success: false, message: "Employee not linked to Odoo" };
    }

    // Create attendance in Odoo
    const attendanceData: Record<string, unknown> = {
      employee_id: employee.odoo_employee_id,
      check_in: attendance.check_in,
    };

    if (attendance.check_out) {
      attendanceData.check_out = attendance.check_out;
    }

    const odooAttendanceId = (await execute("hr.attendance", "create", [
      attendanceData,
    ])) as number;

    // Update local record
    await supabase
      .from("production_attendance")
      .update({
        odoo_attendance_id: odooAttendanceId,
        odoo_sync_status: "synced",
      })
      .eq("id", attendanceId);

    return {
      success: true,
      message: `Attendance synced to Odoo (ID: ${odooAttendanceId})`,
      data: { odooAttendanceId },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await getSupabase()
      .from("production_attendance")
      .update({ odoo_sync_status: "error" })
      .eq("id", attendanceId);

    return {
      success: false,
      message: "Failed to sync attendance to Odoo",
      error: errorMessage,
    };
  }
}

/**
 * Bulk sync all attendance records for a shift to Odoo
 */
export async function bulkSyncAttendanceToOdoo(
  shiftId: string,
): Promise<SyncResult> {
  try {
    const { data: attendanceRecords, error } = await getSupabase()
      .from("production_attendance")
      .select(
        `
        *,
        employee:employees(*)
      `,
      )
      .eq("shift_id", shiftId)
      .eq("odoo_sync_status", "pending");

    if (error) {
      return {
        success: false,
        message: "Failed to fetch attendance records",
        error: error.message,
      };
    }

    if (!attendanceRecords || attendanceRecords.length === 0) {
      return {
        success: true,
        message: "No pending attendance records to sync",
      };
    }

    let synced = 0;
    let failed = 0;

    for (const record of attendanceRecords) {
      const result = await createAttendanceInOdoo(record.id);
      if (result.success) {
        synced++;
      } else {
        failed++;
      }
    }

    // Log sync
    await getSupabase()
      .from("production_sync_log")
      .insert({
        sync_type: "attendance_sync",
        status: failed === 0 ? "success" : "error",
        odoo_response: { shift_id: shiftId, synced, failed },
      });

    return {
      success: failed === 0,
      message: `Synced ${synced}/${attendanceRecords.length} attendance records`,
      data: { synced, failed },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to bulk sync attendance",
      error: errorMessage,
    };
  }
}

// ============================================================================
// Shift Management
// ============================================================================

/**
 * Create a new shift for a production order
 */
export async function createShift(
  orderId: string,
  shiftDate: string,
  startTime: string,
  employeeIds: string[],
  notes?: string,
): Promise<{ success: boolean; shiftId?: string; error?: string }> {
  try {
    const supabase = getSupabase();

    const { data: shift, error: shiftError } = await supabase
      .from("production_shifts")
      .insert({
        production_order_id: orderId,
        shift_date: shiftDate,
        start_time: startTime,
        status: "in_progress",
        notes: notes ?? null,
      })
      .select()
      .single();

    if (shiftError || !shift) {
      return {
        success: false,
        error: shiftError?.message ?? "Failed to create shift",
      };
    }

    // Create attendance for each employee
    for (const employeeId of employeeIds) {
      await supabase.from("production_attendance").insert({
        shift_id: shift.id,
        employee_id: employeeId,
        check_in: startTime,
      });
    }

    return { success: true, shiftId: shift.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * End a shift (set end time and update attendance)
 */
export async function endShift(
  shiftId: string,
  endTime: string,
): Promise<SyncResult> {
  try {
    const supabase = getSupabase();

    // Update shift
    await supabase
      .from("production_shifts")
      .update({
        end_time: endTime,
        status: "completed",
      })
      .eq("id", shiftId);

    // Update all attendance records with check_out
    await supabase
      .from("production_attendance")
      .update({ check_out: endTime })
      .eq("shift_id", shiftId)
      .is("check_out", null);

    return { success: true, message: "Shift ended successfully" };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to end shift",
      error: errorMessage,
    };
  }
}

/**
 * Get shifts for a production order
 */
export async function getShifts(orderId: string): Promise<ProductionShift[]> {
  const { data, error } = await getSupabase()
    .from("production_shifts")
    .select(
      `
      *,
      attendance:production_attendance(
        *,
        employee:employees(*)
      )
    `,
    )
    .eq("production_order_id", orderId)
    .order("start_time", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ============================================================================
// Manufacturing Order Done (Approval Workflow - Issue #25)
// ============================================================================

/**
 * Mark a Manufacturing Order as Done in Odoo
 * Called after approval workflow is complete
 */
export async function markManufacturingOrderDoneInOdoo(
  orderId: string,
): Promise<SyncResult> {
  try {
    const supabase = getSupabase();

    // Get the production order
    const order = await getProductionOrder(orderId);
    if (!order) {
      return { success: false, message: "Production order not found" };
    }

    if (!order.odoo_production_id) {
      return {
        success: false,
        message: "Order not synced to Odoo - please sync first",
      };
    }

    // Call Odoo to mark as done using button_mark_done
    await execute("mrp.production", "button_mark_done", [
      [order.odoo_production_id],
    ]);

    // Update local status
    await supabase
      .from("production_orders")
      .update({
        status: "completed",
        end_date: new Date().toISOString(),
      })
      .eq("id", orderId);

    // Log sync
    await supabase.from("production_sync_log").insert({
      production_order_id: orderId,
      sync_type: "mo_done",
      status: "success",
      odoo_response: {
        odoo_production_id: order.odoo_production_id,
        action: "button_mark_done",
      },
    });

    return {
      success: true,
      message: `Manufacturing Order marked as Done in Odoo (ID: ${order.odoo_production_id})`,
      data: { odooProductionId: order.odoo_production_id },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await getSupabase().from("production_sync_log").insert({
      production_order_id: orderId,
      sync_type: "mo_done",
      status: "error",
      error_message: errorMessage,
    });

    return {
      success: false,
      message: "Failed to mark MO as Done in Odoo",
      error: errorMessage,
    };
  }
}

/**
 * Update production order status
 */
export async function updateProductionOrderStatus(
  orderId: string,
  status: string,
  userId?: string,
): Promise<SyncResult> {
  try {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "in_progress") {
      updateData.start_date = new Date().toISOString();
    }
    if (status === "done" || status === "completed") {
      updateData.end_date = new Date().toISOString();
    }
    if (status === "approved" && userId) {
      updateData.approved_at = new Date().toISOString();
      updateData.approved_by = userId;
    }
    if (status === "pending_approval") {
      updateData.submitted_for_approval_at = new Date().toISOString();
    }

    const { error } = await getSupabase()
      .from("production_orders")
      .update(updateData)
      .eq("id", orderId);

    if (error) {
      return {
        success: false,
        message: "Failed to update status",
        error: error.message,
      };
    }

    return { success: true, message: `Order status updated to ${status}` };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Failed to update status",
      error: errorMessage,
    };
  }
}
