export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  success,
  created,
  error,
  parseBody,
  parseQuery,
  sanitizeSearchTerm,
} from "@/lib/api-utils";
import { notifyNewLeadDetailed } from "@/lib/telegram";
import { sendPushToUser } from "@/lib/push/fcm";
import {
  createLeadSchema,
  paginationSchema,
  leadFiltersSchema,
  type Lead,
} from "@maiyuri/shared";

/**
 * Resolve which users should receive a "new lead" push:
 * the assigned rep if set, otherwise leadership (founder/owner).
 */
async function resolveNewLeadRecipients(
  assignedStaff: string | null,
): Promise<string[]> {
  if (assignedStaff) return [assignedStaff];
  const { data } = await supabaseAdmin
    .from("users")
    .select("id")
    .in("role", ["founder", "owner"]);
  return (data ?? []).map((u) => u.id);
}

// GET /api/leads - List all leads with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const queryParams = parseQuery(request);

    // Parse pagination
    const { page, limit } = paginationSchema.parse(queryParams);
    const offset = (page - 1) * limit;

    // Parse filters
    const filters = leadFiltersSchema.parse(queryParams);

    // Build query
    let query = supabaseAdmin
      .from("leads")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filters.lead_status) {
      query = query.eq("lead_status", filters.lead_status);
    }
    if (filters.pipeline_stage) {
      query = query.eq("pipeline_stage", filters.pipeline_stage);
    }
    if (filters.lead_temperature) {
      query = query.eq("lead_temperature", filters.lead_temperature);
    }
    if (filters.assigned_staff) {
      query = query.eq("assigned_staff", filters.assigned_staff);
    }
    if (filters.search) {
      // Sanitize search term to prevent filter injection
      const sanitized = sanitizeSearchTerm(filters.search);
      query = query.or(
        `name.ilike.%${sanitized}%,contact.ilike.%${sanitized}%`,
      );
    }
    if (filters.from_date) {
      query = query.gte("created_at", filters.from_date);
    }
    if (filters.to_date) {
      query = query.lte("created_at", filters.to_date);
    }

    // Filter by archive status (default to active only)
    query = query.eq("is_archived", filters.is_archived ?? false);

    const { data, error: dbError, count } = await query;

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to fetch leads", 500);
    }

    return success<Lead[]>(data || [], {
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("Error fetching leads:", err);
    return error("Internal server error", 500);
  }
}

// POST /api/leads - Create a new lead
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, createLeadSchema);
    if (parsed.error) return parsed.error;

    const { data: lead, error: dbError } = await supabaseAdmin
      .from("leads")
      .insert(parsed.data)
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return error("Failed to create lead", 500);
    }

    // Send detailed Telegram notification (non-blocking)
    notifyNewLeadDetailed({
      id: lead.id,
      name: lead.name,
      phone: lead.contact,
      source: lead.source,
      location: lead.location,
      requirements: lead.requirements,
      budget: lead.budget,
      assignedStaff: lead.assigned_staff,
    }).catch((err) => {
      console.error("Failed to send Telegram notification:", err);
    });

    // Native push for the new lead (best-effort, non-blocking).
    (async () => {
      const recipients = await resolveNewLeadRecipients(
        lead.assigned_staff ?? null,
      );
      const detail = [lead.source, lead.location, lead.requirements]
        .filter(Boolean)
        .join(" · ");
      await Promise.all(
        recipients.map((uid) =>
          sendPushToUser(uid, {
            title: `🆕 New lead: ${lead.name}`,
            body: detail || lead.contact || "Tap to view the new lead.",
            data: { url: `/leads/${lead.id}` },
          }),
        ),
      );
    })().catch((err) => {
      console.error("Failed to send new-lead push:", err);
    });

    return created<Lead>(lead);
  } catch (err) {
    console.error("Error creating lead:", err);
    return error("Internal server error", 500);
  }
}
