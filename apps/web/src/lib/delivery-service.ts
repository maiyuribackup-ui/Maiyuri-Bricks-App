/**
 * Delivery Management Service
 * 2-way integration with Odoo stock.picking (delivery orders)
 */

import { createClient } from "@supabase/supabase-js";
import type {
  Delivery,
  DeliveryWithLines,
  DeliveryLine,
  DeliveryFilters,
  DeliveryStatus,
  DeliverySyncStatus,
  CompleteDeliveryInput,
  UpdateDeliveryStatusInput,
  AssignDriverInput,
} from "@maiyuri/shared";

// Odoo Configuration
const ODOO_CONFIG = {
  url: process.env.ODOO_URL || "",
  db: process.env.ODOO_DB || "",
  username: process.env.ODOO_USER || "",
  password: process.env.ODOO_PASSWORD || "",
};

// Supabase client for server-side operations
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Types for Odoo responses
interface OdooPicking {
  id: number;
  name: string;
  origin: string | false;
  partner_id: [number, string] | false;
  sale_id: [number, string] | false;
  state: string;
  scheduled_date: string;
  date_done: string | false;
  user_id: [number, string] | false;
  priority: string;
  carrier_tracking_ref: string | false;
}

interface OdooMove {
  id: number;
  picking_id: [number, string];
  product_id: [number, string];
  product_uom_qty: number;
  quantity: number;
  product_uom: [number, string];
  name: string;
  sequence: number;
}

interface OdooPartner {
  id: number;
  name: string;
  phone: string | false;
  mobile: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  partner_latitude: number;
  partner_longitude: number;
}

interface SyncResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

// Odoo state to app status mapping
const ODOO_STATE_TO_STATUS: Record<string, DeliveryStatus> = {
  draft: "draft",
  waiting: "waiting",
  confirmed: "confirmed",
  assigned: "assigned",
  done: "delivered",
  cancel: "cancelled",
};

// App status to Odoo state mapping
const STATUS_TO_ODOO_STATE: Record<DeliveryStatus, string> = {
  draft: "draft",
  waiting: "waiting",
  confirmed: "confirmed",
  assigned: "assigned",
  in_transit: "assigned", // Odoo doesn't have in_transit
  delivered: "done",
  cancelled: "cancel",
};

/**
 * XML-RPC call to Odoo
 */
async function odooXmlRpc(
  service: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const url = `${ODOO_CONFIG.url}/xmlrpc/2/${service}`;

  // Build XML-RPC payload
  const xmlPayload = buildXmlRpcPayload(method, params);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xmlPayload,
  });

  if (!response.ok) {
    throw new Error(`Odoo request failed: ${response.status}`);
  }

  const text = await response.text();
  return parseXmlRpcResponse(text);
}

/**
 * Build XML-RPC payload
 */
function buildXmlRpcPayload(method: string, params: unknown[]): string {
  const paramsXml = params
    .map((p) => `<param>${valueToXml(p)}</param>`)
    .join("");
  return `<?xml version="1.0"?>
<methodCall>
  <methodName>${method}</methodName>
  <params>${paramsXml}</params>
</methodCall>`;
}

/**
 * Convert JS value to XML-RPC format
 */
function valueToXml(value: unknown): string {
  if (value === null || value === undefined) {
    return "<value><boolean>0</boolean></value>";
  }
  if (typeof value === "boolean") {
    return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return `<value><int>${value}</int></value>`;
    }
    return `<value><double>${value}</double></value>`;
  }
  if (typeof value === "string") {
    return `<value><string>${escapeXml(value)}</string></value>`;
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => valueToXml(v)).join("");
    return `<value><array><data>${items}</data></array></value>`;
  }
  if (typeof value === "object") {
    const members = Object.entries(value)
      .map(([k, v]) => `<member><name>${k}</name>${valueToXml(v)}</member>`)
      .join("");
    return `<value><struct>${members}</struct></value>`;
  }
  return `<value><string>${String(value)}</string></value>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Parse XML-RPC response
 */
function parseXmlRpcResponse(xml: string): unknown {
  // Handle fault responses
  if (xml.includes("<fault>")) {
    const faultMatch = xml.match(/<string>([^<]*)<\/string>/);
    throw new Error(faultMatch?.[1] || "Odoo XML-RPC fault");
  }

  // Extract value from response
  const valueMatch = xml.match(/<value>[\s\S]*?<\/value>/);
  if (!valueMatch) return null;

  return parseXmlValue(valueMatch[0]);
}

/**
 * Parse XML value to JS
 */
function parseXmlValue(xml: string): unknown {
  // Integer
  const intMatch = xml.match(/<int>(-?\d+)<\/int>|<i4>(-?\d+)<\/i4>/);
  if (intMatch) return parseInt(intMatch[1] || intMatch[2], 10);

  // Double
  const doubleMatch = xml.match(/<double>(-?[\d.]+)<\/double>/);
  if (doubleMatch) return parseFloat(doubleMatch[1]);

  // Boolean
  const boolMatch = xml.match(/<boolean>([01])<\/boolean>/);
  if (boolMatch) return boolMatch[1] === "1";

  // String
  const stringMatch = xml.match(/<string>([\s\S]*?)<\/string>/);
  if (stringMatch) return stringMatch[1];

  // Array
  if (xml.includes("<array>")) {
    const dataMatch = xml.match(/<data>([\s\S]*?)<\/data>/);
    if (dataMatch) {
      const values = dataMatch[1].match(/<value>[\s\S]*?<\/value>/g) || [];
      return values.map(parseXmlValue);
    }
    return [];
  }

  // Struct (object)
  if (xml.includes("<struct>")) {
    const result: Record<string, unknown> = {};
    const memberMatches = xml.matchAll(
      /<member>\s*<name>([^<]+)<\/name>\s*(<value>[\s\S]*?<\/value>)\s*<\/member>/g,
    );
    for (const match of memberMatches) {
      result[match[1]] = parseXmlValue(match[2]);
    }
    return result;
  }

  // Default empty value
  if (xml.match(/<value\s*\/>/)) return "";
  if (xml.match(/<value>\s*<\/value>/)) return "";

  return null;
}

/**
 * Authenticate with Odoo
 */
async function authenticate(): Promise<number> {
  const uid = await odooXmlRpc("common", "authenticate", [
    ODOO_CONFIG.db,
    ODOO_CONFIG.username,
    ODOO_CONFIG.password,
    {},
  ]);

  if (typeof uid !== "number" || uid <= 0) {
    throw new Error("Odoo authentication failed");
  }

  return uid;
}

/**
 * Execute Odoo method
 */
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

/**
 * Pull deliveries from Odoo and sync to local database
 */
export async function pullDeliveriesFromOdoo(
  dateFrom?: string,
): Promise<SyncResult> {
  try {
    const supabase = getSupabase();

    // Build domain for outgoing deliveries
    const domain: unknown[][] = [["picking_type_code", "=", "outgoing"]];

    // Optionally filter by date
    if (dateFrom) {
      domain.push(["scheduled_date", ">=", dateFrom]);
    }

    // Fetch deliveries from Odoo
    const pickings = (await execute("stock.picking", "search_read", [domain], {
      fields: [
        "id",
        "name",
        "origin",
        "partner_id",
        "sale_id",
        "state",
        "scheduled_date",
        "date_done",
        "user_id",
        "priority",
        "carrier_tracking_ref",
      ],
      order: "scheduled_date asc",
    })) as OdooPicking[];

    if (!Array.isArray(pickings)) {
      return { success: false, message: "Invalid response from Odoo" };
    }

    let synced = 0;
    let errors = 0;

    for (const picking of pickings) {
      try {
        // Fetch partner details for customer info
        let customerData = {
          name: "Unknown Customer",
          phone: null as string | null,
          address: null as string | null,
          city: null as string | null,
          latitude: null as number | null,
          longitude: null as number | null,
        };

        if (picking.partner_id && picking.partner_id[0]) {
          const partners = (await execute(
            "res.partner",
            "read",
            [[picking.partner_id[0]]],
            {
              fields: [
                "name",
                "phone",
                "mobile",
                "street",
                "street2",
                "city",
                "partner_latitude",
                "partner_longitude",
              ],
            },
          )) as OdooPartner[];

          if (partners.length > 0) {
            const partner = partners[0];
            customerData = {
              name: partner.name,
              phone: partner.phone || partner.mobile || null,
              address:
                [partner.street, partner.street2].filter(Boolean).join(", ") ||
                null,
              city: partner.city || null,
              latitude: partner.partner_latitude || null,
              longitude: partner.partner_longitude || null,
            };
          }
        }

        // Map Odoo state to app status
        const status = ODOO_STATE_TO_STATUS[picking.state] || "confirmed";

        // Prepare delivery data
        const deliveryData = {
          odoo_picking_id: picking.id,
          name: picking.name,
          origin: picking.origin || null,
          odoo_sale_id: picking.sale_id ? picking.sale_id[0] : null,
          odoo_sale_name: picking.sale_id ? picking.sale_id[1] : null,
          customer_name: customerData.name,
          customer_phone: customerData.phone,
          customer_address: customerData.address,
          customer_city: customerData.city,
          delivery_latitude: customerData.latitude,
          delivery_longitude: customerData.longitude,
          status,
          priority: picking.priority === "1" ? 1 : 0,
          scheduled_date: picking.scheduled_date,
          date_done: picking.date_done || null,
          odoo_user_id: picking.user_id ? picking.user_id[0] : null,
          carrier_tracking_ref: picking.carrier_tracking_ref || null,
          odoo_synced_at: new Date().toISOString(),
          odoo_sync_status: "synced" as DeliverySyncStatus,
        };

        // Upsert delivery
        const { data: delivery, error: deliveryError } = await supabase
          .from("deliveries")
          .upsert(deliveryData, { onConflict: "odoo_picking_id" })
          .select("id")
          .single();

        if (deliveryError) {
          console.error(
            `Error upserting delivery ${picking.name}:`,
            deliveryError,
          );
          errors++;
          continue;
        }

        // Fetch and sync move lines
        const moves = (await execute(
          "stock.move",
          "search_read",
          [[["picking_id", "=", picking.id]]],
          {
            fields: [
              "id",
              "product_id",
              "product_uom_qty",
              "quantity",
              "product_uom",
              "name",
              "sequence",
            ],
            order: "sequence asc",
          },
        )) as OdooMove[];

        // Delete existing lines and insert new ones
        await supabase
          .from("delivery_lines")
          .delete()
          .eq("delivery_id", delivery.id);

        const lineData = moves.map((move, index) => ({
          delivery_id: delivery.id,
          odoo_move_id: move.id,
          product_name: move.name || move.product_id[1],
          product_code: null, // Would need separate product lookup
          odoo_product_id: move.product_id[0],
          quantity_ordered: move.product_uom_qty,
          quantity_delivered: move.quantity || null,
          uom_name: move.product_uom ? move.product_uom[1] : null,
          sort_order: index,
        }));

        if (lineData.length > 0) {
          await supabase.from("delivery_lines").insert(lineData);
        }

        // Calculate totals
        const totalQty = moves.reduce((sum, m) => sum + m.product_uom_qty, 0);
        await supabase
          .from("deliveries")
          .update({ total_quantity: totalQty })
          .eq("id", delivery.id);

        synced++;
      } catch (pickingError) {
        console.error(
          `Error processing picking ${picking.name}:`,
          pickingError,
        );
        errors++;
      }
    }

    // Log sync
    await supabase.from("delivery_sync_log").insert({
      sync_type: "pull",
      status: errors === 0 ? "success" : "error",
      odoo_response: { total: pickings.length, synced, errors },
      error_message: errors > 0 ? `${errors} deliveries failed to sync` : null,
    });

    return {
      success: true,
      message: `Synced ${synced} deliveries, ${errors} errors`,
      data: { total: pickings.length, synced, errors },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Pull deliveries error:", errorMessage);

    await getSupabase().from("delivery_sync_log").insert({
      sync_type: "pull",
      status: "error",
      error_message: errorMessage,
    });

    return { success: false, message: "Sync failed", error: errorMessage };
  }
}

/**
 * Get deliveries from local database with filters
 */
export async function getDeliveries(
  filters: DeliveryFilters = {},
): Promise<{ data: DeliveryWithLines[] | null; error: string | null }> {
  const supabase = getSupabase();

  let query = supabase
    .from("deliveries")
    .select(
      `
      *,
      delivery_lines (*)
    `,
    )
    .order("scheduled_date", { ascending: filters.sort_order !== "desc" });

  // Apply filters
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.driver_id) {
    query = query.eq("assigned_driver_id", filters.driver_id);
  }

  if (filters.from_date) {
    query = query.gte("scheduled_date", filters.from_date);
  }

  if (filters.to_date) {
    query = query.lte("scheduled_date", filters.to_date);
  }

  if (filters.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%,origin.ilike.%${filters.search}%`,
    );
  }

  // Pagination
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as DeliveryWithLines[], error: null };
}

/**
 * Get single delivery by ID
 */
export async function getDeliveryById(
  id: string,
): Promise<{ data: DeliveryWithLines | null; error: string | null }> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("deliveries")
    .select(
      `
      *,
      delivery_lines (*)
    `,
    )
    .eq("id", id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as DeliveryWithLines, error: null };
}

/**
 * Update delivery status locally and push to Odoo
 */
export async function updateDeliveryStatus(
  deliveryId: string,
  input: UpdateDeliveryStatusInput,
): Promise<SyncResult> {
  const supabase = getSupabase();
  const { status, notes } = input;

  try {
    // Get delivery
    const { data: delivery, error: fetchError } = await supabase
      .from("deliveries")
      .select("*")
      .eq("id", deliveryId)
      .single();

    if (fetchError || !delivery) {
      return { success: false, message: "Delivery not found" };
    }

    // Update locally
    const updateData: Partial<Delivery> = {
      status,
      last_local_update: new Date().toISOString(),
      odoo_sync_status: "pending_push" as DeliverySyncStatus,
    };

    if (notes) {
      updateData.delivery_notes = notes;
    }

    if (status === "delivered") {
      updateData.date_done = new Date().toISOString();
    }

    await supabase.from("deliveries").update(updateData).eq("id", deliveryId);

    // Push status to Odoo if not in_transit (Odoo doesn't have this state)
    if (status !== "in_transit") {
      try {
        const odooState = STATUS_TO_ODOO_STATE[status];

        // For 'delivered' status, use button_validate to complete
        if (status === "delivered") {
          await execute(
            "stock.picking",
            "button_validate",
            [[delivery.odoo_picking_id]],
            {
              context: {
                skip_backorder: true,
                mail_auto_subscribe_no_notify: true,
                mail_create_nosubscribe: true,
                tracking_disable: true,
              },
            },
          );
        } else if (status === "cancelled") {
          await execute(
            "stock.picking",
            "action_cancel",
            [[delivery.odoo_picking_id]],
            {
              context: {
                mail_auto_subscribe_no_notify: true,
                mail_create_nosubscribe: true,
                tracking_disable: true,
              },
            },
          );
        } else {
          // For other states, just write the state
          await execute(
            "stock.picking",
            "write",
            [[delivery.odoo_picking_id], { state: odooState }],
            {
              context: {
                mail_auto_subscribe_no_notify: true,
                mail_create_nosubscribe: true,
                tracking_disable: true,
              },
            },
          );
        }

        // Mark as synced
        await supabase
          .from("deliveries")
          .update({
            odoo_sync_status: "synced",
            odoo_synced_at: new Date().toISOString(),
          })
          .eq("id", deliveryId);

        // Log success
        await supabase.from("delivery_sync_log").insert({
          delivery_id: deliveryId,
          sync_type: "push_status",
          status: "success",
          odoo_response: { status, odoo_state: odooState },
        });
      } catch (odooError) {
        const errorMsg =
          odooError instanceof Error ? odooError.message : "Odoo sync failed";

        await supabase
          .from("deliveries")
          .update({ odoo_sync_status: "error" })
          .eq("id", deliveryId);

        await supabase.from("delivery_sync_log").insert({
          delivery_id: deliveryId,
          sync_type: "push_status",
          status: "error",
          error_message: errorMsg,
        });

        // Return partial success - local update worked
        return {
          success: true,
          message: "Status updated locally, Odoo sync failed",
          error: errorMsg,
        };
      }
    }

    return {
      success: true,
      message: `Status updated to ${status}`,
      data: { status },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, message: "Update failed", error: errorMessage };
  }
}

/**
 * Assign driver to delivery
 */
export async function assignDriver(
  deliveryId: string,
  input: AssignDriverInput,
): Promise<SyncResult> {
  const supabase = getSupabase();
  const driverId = input.driver_id;

  try {
    // Get driver's Odoo user ID mapping
    const { data: mapping } = await supabase
      .from("user_odoo_mapping")
      .select("odoo_user_id")
      .eq("user_id", driverId)
      .single();

    const odooUserId = mapping?.odoo_user_id ?? null;

    // Update locally
    await supabase
      .from("deliveries")
      .update({
        assigned_driver_id: driverId,
        odoo_user_id: odooUserId,
        last_local_update: new Date().toISOString(),
        odoo_sync_status: odooUserId ? "pending_push" : "synced",
      })
      .eq("id", deliveryId);

    // Push to Odoo if we have mapping
    if (odooUserId) {
      const { data: delivery } = await supabase
        .from("deliveries")
        .select("odoo_picking_id")
        .eq("id", deliveryId)
        .single();

      if (delivery?.odoo_picking_id) {
        try {
          await execute(
            "stock.picking",
            "write",
            [[delivery.odoo_picking_id], { user_id: odooUserId }],
            {
              context: {
                mail_auto_subscribe_no_notify: true,
                mail_create_nosubscribe: true,
                tracking_disable: true,
              },
            },
          );

          await supabase
            .from("deliveries")
            .update({
              odoo_sync_status: "synced",
              odoo_synced_at: new Date().toISOString(),
            })
            .eq("id", deliveryId);

          await supabase.from("delivery_sync_log").insert({
            delivery_id: deliveryId,
            sync_type: "push_driver",
            status: "success",
            odoo_response: { odoo_user_id: odooUserId },
          });
        } catch (odooError) {
          await supabase
            .from("deliveries")
            .update({ odoo_sync_status: "error" })
            .eq("id", deliveryId);

          await supabase.from("delivery_sync_log").insert({
            delivery_id: deliveryId,
            sync_type: "push_driver",
            status: "error",
            error_message:
              odooError instanceof Error
                ? odooError.message
                : "Odoo sync failed",
          });
        }
      }
    }

    return {
      success: true,
      message: "Driver assigned",
      data: { driver_id: driverId, odoo_user_id: odooUserId },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Assignment failed",
      error: errorMessage,
    };
  }
}

/**
 * Complete delivery with proof of delivery
 */
export async function completeDelivery(
  deliveryId: string,
  input: CompleteDeliveryInput,
): Promise<SyncResult> {
  const supabase = getSupabase();
  const { signature_data, photo_urls, recipient_name, notes } = input;

  try {
    // Get delivery
    const { data: delivery, error: fetchError } = await supabase
      .from("deliveries")
      .select("*")
      .eq("id", deliveryId)
      .single();

    if (fetchError || !delivery) {
      return { success: false, message: "Delivery not found" };
    }

    // Update locally with POD
    const updateData = {
      status: "delivered" as DeliveryStatus,
      date_done: new Date().toISOString(),
      signature_url: signature_data ?? null,
      signature_captured_at: signature_data ? new Date().toISOString() : null,
      photo_urls: photo_urls ?? null,
      recipient_name: recipient_name ?? null,
      delivery_notes: notes ?? delivery.delivery_notes,
      last_local_update: new Date().toISOString(),
      odoo_sync_status: "pending_push" as DeliverySyncStatus,
    };

    await supabase.from("deliveries").update(updateData).eq("id", deliveryId);

    // Push to Odoo
    try {
      // Validate/complete the delivery in Odoo
      await execute(
        "stock.picking",
        "button_validate",
        [[delivery.odoo_picking_id]],
        {
          context: {
            skip_backorder: true,
            mail_auto_subscribe_no_notify: true,
            mail_create_nosubscribe: true,
            tracking_disable: true,
          },
        },
      );

      // Upload signature as attachment if present
      if (signature_data) {
        try {
          // Fetch signature from Supabase Storage and convert to base64
          const signatureResponse = await fetch(signature_data);
          const signatureBlob = await signatureResponse.blob();
          const signatureBuffer = await signatureBlob.arrayBuffer();
          const signatureBase64 =
            Buffer.from(signatureBuffer).toString("base64");

          await execute("ir.attachment", "create", [
            {
              name: `POD_Signature_${delivery.name}.png`,
              res_model: "stock.picking",
              res_id: delivery.odoo_picking_id,
              datas: signatureBase64,
              type: "binary",
            },
          ]);
        } catch (attachError) {
          console.warn("Failed to upload signature to Odoo:", attachError);
        }
      }

      // Mark as synced
      await supabase
        .from("deliveries")
        .update({
          odoo_sync_status: "synced",
          odoo_synced_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);

      await supabase.from("delivery_sync_log").insert({
        delivery_id: deliveryId,
        sync_type: "push_pod",
        status: "success",
        odoo_response: { completed: true, has_signature: !!signature_data },
      });

      return {
        success: true,
        message: "Delivery completed and synced to Odoo",
        data: { deliveryId, status: "delivered" },
      };
    } catch (odooError) {
      const errorMsg =
        odooError instanceof Error ? odooError.message : "Odoo sync failed";

      await supabase
        .from("deliveries")
        .update({ odoo_sync_status: "error" })
        .eq("id", deliveryId);

      await supabase.from("delivery_sync_log").insert({
        delivery_id: deliveryId,
        sync_type: "push_pod",
        status: "error",
        error_message: errorMsg,
      });

      return {
        success: true,
        message: "Delivery completed locally, Odoo sync failed",
        error: errorMsg,
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      message: "Completion failed",
      error: errorMessage,
    };
  }
}

/**
 * Get user-Odoo mapping for a driver
 */
export async function getUserOdooMapping(
  userId: string,
): Promise<{ odooUserId: number | null; odooUserName: string | null }> {
  const { data } = await getSupabase()
    .from("user_odoo_mapping")
    .select("odoo_user_id, odoo_user_name")
    .eq("user_id", userId)
    .single();

  return {
    odooUserId: data?.odoo_user_id ?? null,
    odooUserName: data?.odoo_user_name ?? null,
  };
}

/**
 * Create or update user-Odoo mapping
 */
export async function setUserOdooMapping(
  userId: string,
  odooUserId: number,
  odooUserName?: string,
): Promise<SyncResult> {
  const { error } = await getSupabase()
    .from("user_odoo_mapping")
    .upsert(
      {
        user_id: userId,
        odoo_user_id: odooUserId,
        odoo_user_name: odooUserName ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    return {
      success: false,
      message: "Failed to set mapping",
      error: error.message,
    };
  }

  return { success: true, message: "Mapping saved" };
}
