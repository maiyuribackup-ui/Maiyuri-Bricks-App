/**
 * POST/GET /api/recordings/process
 *
 * Processes call recordings that are pending or failed.
 * - POST with { recording_id } processes a specific recording
 * - POST/GET without body processes the oldest pending recording
 * - Backup cron hits GET every 4 hours to catch missed recordings
 *
 * Auth: Bearer CRON_SECRET header required.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { startCronLog } from "@/lib/health/cron-logger";
import { processRecording } from "@/lib/call-recording/processor";
import { log, logError } from "@/lib/call-recording/logger";
import type { CallRecording } from "@/lib/call-recording/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Verify CRON_SECRET authorization
 */
function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    log("CRON_SECRET not configured, rejecting request");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Reset recordings stuck in intermediate states for over 5 minutes
 */
async function recoverStaleRecordings(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("call_recordings")
    .update({
      processing_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .in("processing_status", ["downloading", "uploading", "transcribing", "analyzing"])
    .lt("updated_at", fiveMinutesAgo)
    .lt("retry_count", 3)
    .select("id");

  if (error) {
    logError("Failed to recover stale recordings", error);
    return 0;
  }

  if (data && data.length > 0) {
    log("Recovered stale recordings", {
      count: data.length,
      ids: data.map((r) => r.id),
    });
  }

  return data?.length ?? 0;
}

/**
 * Get next recording to process
 */
async function getNextRecording(
  specificId?: string,
): Promise<CallRecording | null> {
  const supabase = getSupabaseAdmin();

  if (specificId) {
    const { data, error } = await supabase
      .from("call_recordings")
      .select(
        "id, lead_id, phone_number, telegram_file_id, telegram_chat_id, original_filename, processing_status, retry_count, file_size_bytes",
      )
      .eq("id", specificId)
      .single();

    if (error || !data) {
      logError(`Recording ${specificId} not found`, error);
      return null;
    }

    return data as CallRecording;
  }

  // Get oldest pending or failed (with retries left) recording
  const { data, error } = await supabase
    .from("call_recordings")
    .select(
      "id, lead_id, phone_number, telegram_file_id, telegram_chat_id, original_filename, processing_status, retry_count, file_size_bytes",
    )
    .in("processing_status", ["pending", "failed"])
    .lt("retry_count", 3)
    .neq("phone_number", "PENDING")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as CallRecording;
}

/**
 * Get ALL pending recordings for batch processing (cron)
 */
async function getAllPendingRecordings(): Promise<CallRecording[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("call_recordings")
    .select(
      "id, lead_id, phone_number, telegram_file_id, telegram_chat_id, original_filename, processing_status, retry_count, file_size_bytes",
    )
    .in("processing_status", ["pending", "failed"])
    .lt("retry_count", 3)
    .neq("phone_number", "PENDING")
    .order("created_at", { ascending: true })
    .limit(10); // Process up to 10 per cron invocation

  if (error) {
    logError("Failed to fetch pending recordings", error);
    return [];
  }

  return (data ?? []) as CallRecording[];
}

/**
 * Main handler for both POST and GET
 *
 * POST with { recording_id } → process specific recording (webhook trigger)
 * GET → process ALL pending recordings (cron backup)
 */
async function handleProcess(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronLog = await startCronLog("call-recording-process");

  try {
    // Step 1: Recover stale recordings
    const recovered = await recoverStaleRecordings();

    // Step 2: Determine mode — single (POST with ID) or batch (GET cron)
    let recordingId: string | undefined;

    if (request.method === "POST") {
      try {
        const body = await request.json();
        recordingId = body.recording_id;
      } catch {
        // No body or invalid JSON - fall through to batch mode
      }
    }

    // =============================================
    // Single recording mode (webhook trigger)
    // =============================================
    if (recordingId) {
      const recording = await getNextRecording(recordingId);

      if (!recording) {
        log(`Recording ${recordingId} not found`);
        await cronLog.success();
        return NextResponse.json({
          ok: true,
          message: "Recording not found",
          recovered,
        });
      }

      if (recording.processing_status === "completed") {
        log(`Recording ${recording.id} already completed`);
        await cronLog.success();
        return NextResponse.json({
          ok: true,
          message: "Recording already completed",
          recording_id: recording.id,
        });
      }

      log("Processing recording (single)", {
        id: recording.id,
        phone: recording.phone_number,
        status: recording.processing_status,
        retry: recording.retry_count,
      });

      await processRecording(recording);
      await cronLog.success();

      return NextResponse.json({
        ok: true,
        recording_id: recording.id,
        status: "completed",
        recovered,
      });
    }

    // =============================================
    // Batch mode (cron backup) — process ALL pending
    // =============================================
    const pendingRecordings = await getAllPendingRecordings();

    if (pendingRecordings.length === 0) {
      log("No recordings to process");
      await cronLog.success();
      return NextResponse.json({
        ok: true,
        message: "No recordings to process",
        recovered,
      });
    }

    log(`Batch processing ${pendingRecordings.length} pending recordings`);

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const recording of pendingRecordings) {
      if (recording.processing_status === "completed") {
        results.push({ id: recording.id, status: "skipped_completed" });
        continue;
      }

      try {
        log("Processing recording (batch)", {
          id: recording.id,
          phone: recording.phone_number,
          status: recording.processing_status,
          retry: recording.retry_count,
        });

        await processRecording(recording);
        results.push({ id: recording.id, status: "completed" });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logError(`Batch processing failed for ${recording.id}`, error);
        results.push({ id: recording.id, status: "failed", error: errMsg });
        // Continue processing remaining recordings — don't let one failure stop the batch
      }
    }

    await cronLog.success();

    return NextResponse.json({
      ok: true,
      mode: "batch",
      total: pendingRecordings.length,
      results,
      recovered,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError("Recording processing failed", error);
    await cronLog.fail(errorMessage);

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleProcess(request);
}

export async function GET(request: NextRequest) {
  return handleProcess(request);
}
