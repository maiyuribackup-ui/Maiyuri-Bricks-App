export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound, parseBody } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { endShift } from "@/lib/production-service";
import { updateShiftSchema } from "@maiyuri/shared";
import type { ProductionShift } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/production/shifts/[id] - Get a single shift
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return error("Shift ID is required", 400);
    }

    const { data: shift, error: dbError } = await supabaseAdmin
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
      .eq("id", id)
      .single();

    if (dbError || !shift) {
      return notFound("Shift not found");
    }

    return success<ProductionShift>(shift);
  } catch (err) {
    console.error("Error fetching shift:", err);
    return error("Failed to fetch shift", 500);
  }
}

// PUT /api/production/shifts/[id] - Update a shift (primarily for ending)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return error("Shift ID is required", 400);
    }

    const parsed = await parseBody(request, updateShiftSchema);
    if (parsed.error) return parsed.error;

    // If end_time is provided, use the endShift function to update attendance too
    if (parsed.data.end_time) {
      const result = await endShift(id, parsed.data.end_time);
      if (!result.success) {
        return error(result.error ?? result.message, 500);
      }
    } else {
      // Just update the shift directly
      await supabaseAdmin
        .from("production_shifts")
        .update({
          ...parsed.data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    // Fetch updated shift
    const { data: shift, error: dbError } = await supabaseAdmin
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
      .eq("id", id)
      .single();

    if (dbError) {
      return error("Failed to fetch updated shift", 500);
    }

    return success<ProductionShift>(shift);
  } catch (err) {
    console.error("Error updating shift:", err);
    return error("Internal server error", 500);
  }
}

// DELETE /api/production/shifts/[id] - Delete a shift
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return error("Shift ID is required", 400);
    }

    // Check if shift exists
    const { data: existingShift } = await supabaseAdmin
      .from("production_shifts")
      .select("id, status")
      .eq("id", id)
      .single();

    if (!existingShift) {
      return notFound("Shift not found");
    }

    // Delete attendance records first
    await supabaseAdmin
      .from("production_attendance")
      .delete()
      .eq("shift_id", id);

    // Delete the shift
    const { error: dbError } = await supabaseAdmin
      .from("production_shifts")
      .delete()
      .eq("id", id);

    if (dbError) {
      return error("Failed to delete shift", 500);
    }

    return success({ deleted: true, id });
  } catch (err) {
    console.error("Error deleting shift:", err);
    return error("Internal server error", 500);
  }
}
