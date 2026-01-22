export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error, notFound } from "@/lib/api-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createAttendanceInOdoo } from "@/lib/production-service";

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/production/attendance/[id]/sync - Sync attendance record to Odoo
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id) {
      return error("Attendance ID is required", 400);
    }

    // Check if attendance exists
    const { data: attendance, error: dbError } = await supabaseAdmin
      .from("production_attendance")
      .select("id, odoo_attendance_id, odoo_sync_status")
      .eq("id", id)
      .single();

    if (dbError || !attendance) {
      return notFound("Attendance record not found");
    }

    // Check if already synced
    if (attendance.odoo_attendance_id) {
      return error("Attendance already synced to Odoo", 400);
    }

    // Sync to Odoo
    const result = await createAttendanceInOdoo(id);

    if (!result.success) {
      return error(result.error ?? result.message, 500);
    }

    return success({
      odooAttendanceId: result.data?.odooAttendanceId,
      message: result.message,
    });
  } catch (err) {
    console.error("Error syncing attendance:", err);
    return error("Failed to sync attendance to Odoo", 500);
  }
}
