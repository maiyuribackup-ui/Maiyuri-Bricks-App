/**
 * Call Recording Processor
 *
 * Main processing pipeline adapted from Railway worker for Vercel serverless.
 * Key changes from worker:
 * - No ffmpeg conversion (Gemini accepts raw audio natively)
 * - Uses supabaseAdmin from @/lib/supabase-admin
 * - Estimates duration from file size
 * - Awaits trigger calls (must complete before function ends)
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { uploadToGoogleDrive } from "./gdrive-storage";
import { transcribeAudio } from "./transcription";
import { analyzeTranscript, extractLeadDetails } from "./analysis";
import {
  sendCallRecordingNotification,
  sendErrorNotification,
  isInfraError,
} from "./notifications";
import { notifyLeadPush } from "@/lib/push/fcm";
import { logError, logProgress } from "./logger";
import {
  triggerLeadAnalysis,
  triggerCallRecordingNudge,
  triggerObjectionNudge,
} from "./triggers";
import type { CallRecording, ExtractedLeadDetails, ProcessingStatus } from "./types";

/**
 * Update recording status in database
 */
async function updateStatus(
  recordingId: string,
  status: ProcessingStatus,
  additionalFields?: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("call_recordings")
    .update({
      processing_status: status,
      updated_at: new Date().toISOString(),
      ...additionalFields,
    })
    .eq("id", recordingId);

  if (error) {
    logError(`Failed to update status to ${status}`, error);
  }
}

/**
 * Download file from Telegram
 */
async function downloadFromTelegram(fileId: string): Promise<Buffer> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  const fileResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    },
  );

  const fileData = (await fileResponse.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };

  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error(`Failed to get file path: ${JSON.stringify(fileData)}`);
  }

  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
  const downloadResponse = await fetch(downloadUrl);

  if (!downloadResponse.ok) {
    throw new Error(`Failed to download file: ${downloadResponse.status}`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Estimate call duration from file size (no ffmpeg probe available)
 */
function estimateDuration(fileSizeBytes: number, filename: string): number {
  const ext = filename.split(".").pop()?.toLowerCase();
  // Average bytes per second by format
  const rates: Record<string, number> = {
    ogg: 14000,
    wav: 88200,
    mp3: 16000,
    m4a: 16000,
    webm: 12000,
    flac: 44100,
  };
  return Math.round((fileSizeBytes || 0) / (rates[ext ?? ""] ?? 16000));
}

/**
 * Get lead details for notifications
 */
async function getLeadDetails(
  leadId: string | null,
): Promise<{ name: string; id: string; assigned_staff: string | null } | null> {
  if (!leadId) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, assigned_staff")
    .eq("id", leadId)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Main processing function for a single recording
 */
export async function processRecording(
  recording: CallRecording,
): Promise<void> {
  const {
    id,
    telegram_file_id,
    phone_number,
    lead_id,
    telegram_chat_id,
    original_filename,
    file_size_bytes,
  } = recording;

  logProgress(id, "Starting processing", {
    phone: phone_number,
    filename: original_filename,
  });

  const supabase = getSupabaseAdmin();

  try {
    // ========================================
    // Stage 1: Download from Telegram
    // ========================================
    await updateStatus(id, "downloading");
    logProgress(id, "Downloading from Telegram");

    const audioBuffer = await downloadFromTelegram(telegram_file_id);
    logProgress(id, "Downloaded", { size: audioBuffer.length });

    // Estimate duration from file size (no ffmpeg)
    const durationSeconds = estimateDuration(
      file_size_bytes ?? audioBuffer.length,
      original_filename,
    );

    await updateStatus(id, "downloading", {
      duration_seconds: durationSeconds,
    });

    // ========================================
    // Stage 2: Upload to Google Drive (raw audio)
    // ========================================
    const lead = await getLeadDetails(lead_id);
    let driveResult: { fileId: string; webViewLink: string; webContentLink?: string } | null = null;

    const hasGDriveCredentials =
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN;

    if (hasGDriveCredentials) {
      await updateStatus(id, "uploading");
      logProgress(id, "Uploading to Google Drive");

      driveResult = await uploadToGoogleDrive(
        audioBuffer,
        phone_number,
        original_filename,
        lead?.name,
      );

      logProgress(id, "Uploaded to Drive", { fileId: driveResult.fileId });

      await updateStatus(id, "uploading", {
        mp3_gdrive_file_id: driveResult.fileId,
        mp3_gdrive_url: driveResult.webViewLink,
      });
    } else {
      logProgress(id, "Skipping Google Drive upload (credentials not configured)");
    }

    // ========================================
    // Stage 3: Transcribe with Gemini
    // ========================================
    await updateStatus(id, "transcribing");
    logProgress(id, "Transcribing with Gemini");

    const transcription = await transcribeAudio(audioBuffer, original_filename);
    logProgress(id, "Transcribed", {
      language: transcription.language,
      confidence: transcription.confidence,
      length: transcription.text.length,
    });

    await updateStatus(id, "transcribing", {
      transcription_text: transcription.text,
      transcription_language: transcription.language,
      transcription_confidence: transcription.confidence,
    });

    // ========================================
    // Stage 4: AI Analysis
    // ========================================
    await updateStatus(id, "analyzing");
    logProgress(id, "Running AI analysis");

    const analysis = await analyzeTranscript(
      transcription.text,
      phone_number,
      lead?.name,
    );
    logProgress(id, "Analysis complete", {
      sentiment: analysis.insights.sentiment,
      hasRecommendations:
        (analysis.insights.recommended_actions?.length ?? 0) > 0,
    });

    await updateStatus(id, "analyzing", {
      ai_summary: analysis.summary,
      ai_insights: analysis.insights,
      ai_score_impact: analysis.scoreImpact,
    });

    // ========================================
    // Stage 4b: Extract Lead Details
    // ========================================
    let extractedDetails: ExtractedLeadDetails | null = null;
    let isNewlyAutoPopulated = false;

    if (lead_id) {
      logProgress(id, "Extracting lead details from transcription");

      extractedDetails = await extractLeadDetails(
        transcription.text,
        phone_number,
        lead?.name,
      );

      logProgress(id, "Lead details extracted", {
        lead_type: extractedDetails.lead_type,
        classification: extractedDetails.classification,
        site_region: extractedDetails.site_region,
      });

      // Update lead with extracted fields (only if currently empty)
      const { data: currentLead, error: leadFetchError } = await supabase
        .from("leads")
        .select(
          // NOTE: leads has NO "notes" column (notes are their own table) —
          // selecting it made this whole fetch 42703-fail silently, which is
          // why lead auto-population never actually ran until Jul 2026.
          "lead_type, classification, requirement_type, product_interests, site_region, site_location, next_action, follow_up_date, estimated_quantity",
        )
        .eq("id", lead_id)
        .single();
      if (leadFetchError) {
        // Loud, not silent — a bad column here disables auto-population.
        logError("Lead fetch for auto-population failed", leadFetchError);
      }

      if (currentLead) {
        const updates: Record<string, unknown> = {};

        if (
          currentLead.lead_type === "Other" &&
          extractedDetails.lead_type !== "Other"
        ) {
          updates.lead_type = extractedDetails.lead_type;
        }
        if (
          currentLead.classification === "direct_customer" &&
          extractedDetails.classification !== "direct_customer"
        ) {
          updates.classification = extractedDetails.classification;
        }
        if (!currentLead.requirement_type && extractedDetails.requirement_type) {
          updates.requirement_type = extractedDetails.requirement_type;
        }
        if (
          (!currentLead.product_interests ||
            currentLead.product_interests.length === 0) &&
          extractedDetails.product_interests.length > 0
        ) {
          updates.product_interests = extractedDetails.product_interests;
        }
        if (!currentLead.site_region && extractedDetails.site_region) {
          updates.site_region = extractedDetails.site_region;
        }
        if (!currentLead.site_location && extractedDetails.site_location) {
          updates.site_location = extractedDetails.site_location;
        }
        // Next action: the LATEST call always wins — a stale "send quotation"
        // from last week must not survive a call that agreed on a site visit.
        if (
          extractedDetails.next_action &&
          extractedDetails.next_action !== currentLead.next_action
        ) {
          updates.next_action = extractedDetails.next_action;
        }
        // Follow-up date: set when empty; when one exists, only ever PULL IT
        // EARLIER (a call can add urgency, never silently postpone). If the
        // call needs a follow-up but gave no timing, the extractor already
        // defaulted to tomorrow.
        if (extractedDetails.follow_up_date) {
          const existing = currentLead.follow_up_date
            ? String(currentLead.follow_up_date).slice(0, 10)
            : null;
          if (!existing || extractedDetails.follow_up_date < existing) {
            updates.follow_up_date = extractedDetails.follow_up_date;
          }
        }
        if (!currentLead.estimated_quantity && extractedDetails.estimated_quantity) {
          updates.estimated_quantity = extractedDetails.estimated_quantity;
        }
        // (extractedDetails.notes intentionally NOT written — leads has no
        // notes column; call context already lives in ai_summary + transcript.)

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from("leads")
            .update({
              ...updates,
              updated_at: new Date().toISOString(),
            })
            .eq("id", lead_id);

          if (updateError) {
            logError(
              "Failed to update lead with extracted details",
              updateError,
            );
          } else {
            isNewlyAutoPopulated = true;
            logProgress(id, "Lead auto-populated with fields", {
              fields: Object.keys(updates),
            });
          }
        }
      }

      // Turn the next action into a REAL task in My Work so the whole
      // accountability machine (task-first home, 2h nags, founder escalation,
      // evening chaser) owns it — a lead field alone can be ignored.
      if (extractedDetails.next_action && extractedDetails.follow_up_date) {
        await upsertNextActionTask(
          lead_id,
          lead?.name ?? phone_number,
          (lead?.assigned_staff as string | null) ?? null,
          extractedDetails.next_action,
          extractedDetails.follow_up_date,
          id,
        );
      }
    }

    // ========================================
    // Stage 5: Send Telegram Notification
    // ========================================
    logProgress(id, "Sending notification");

    await sendCallRecordingNotification(telegram_chat_id.toString(), {
      leadName: lead?.name,
      leadId: lead?.id,
      phoneNumber: phone_number,
      duration: durationSeconds,
      summary: analysis.summary,
      insights: analysis.insights,
      scoreImpact: analysis.scoreImpact,
      driveUrl: driveResult?.webViewLink,
      extractedDetails: extractedDetails ?? undefined,
      isNewlyAutoPopulated,
    });

    // Native push to the rep who owns this lead (best-effort, non-blocking).
    if (lead?.assigned_staff && lead?.id) {
      await notifyLeadPush([lead.assigned_staff], {
        title: lead.name ? `📞 Call logged: ${lead.name}` : "📞 New call logged",
        body:
          (analysis.summary || "A new call recording was processed.").slice(0, 160),
        leadId: lead.id,
      });
    }

    // ========================================
    // Stage 6: Trigger Lead Analysis (awaited in serverless)
    // ========================================
    if (lead_id) {
      logProgress(id, "Triggering lead analysis");
      try {
        await triggerLeadAnalysis({ leadId: lead_id, recordingId: id });
      } catch (err) {
        logError(`Failed to trigger analysis for lead ${lead_id}`, err);
      }
    }

    // ========================================
    // Stage 7: Trigger Event Nudges (awaited in serverless)
    // ========================================
    if (lead_id) {
      logProgress(id, "Triggering event nudges");

      const objections = [
        ...(analysis.insights?.complaints ?? []),
        ...(analysis.insights?.negative_feedback ?? []),
      ];

      try {
        await triggerCallRecordingNudge({
          leadId: lead_id,
          recordingId: id,
          summary: analysis.summary,
          objections,
        });

        if (objections.length > 0) {
          await triggerObjectionNudge({
            leadId: lead_id,
            recordingId: id,
            objections,
          });
        }
      } catch (err) {
        logError(`Failed to trigger nudges for lead ${lead_id}`, err);
      }
    }

    // ========================================
    // Mark as completed
    // ========================================
    await updateStatus(id, "completed", {
      processed_at: new Date().toISOString(),
    });

    logProgress(id, "Processing completed successfully");
  } catch (error) {
    logError(`Processing failed for ${id}`, error);

    const message = error instanceof Error ? error.message : String(error);
    const infra = isInfraError(message);

    await updateStatus(id, "failed", {
      error_message: message,
      // Infra / AI-provider outages (depleted credits, expired key, quota, 5xx,
      // network) aren't this recording's fault — don't burn a retry, or a
      // transient outage permanently strands real calls at retry_count >= 3.
      retry_count: infra ? recording.retry_count : recording.retry_count + 1,
    });

    // Per-recording alert only for genuine per-recording failures. Infra outages
    // are alerted once, aggregated, by the caller (see process route).
    if (!infra) {
      await sendErrorNotification(id, message).catch(() => {});
    }

    throw error;
  }
}

/**
 * Turn a call's extracted next action into a My Work task so the
 * accountability engine (task-first home, 2h nags, >4h founder escalation,
 * 6pm chaser) chases it. One OPEN task per lead from this source — a newer
 * call updates it (and re-arms the nag counters) instead of stacking
 * duplicates. Best-effort: never fails the recording pipeline.
 */
async function upsertNextActionTask(
  leadId: string,
  leadName: string,
  assignedStaff: string | null,
  nextAction: string,
  followUpDate: string, // YYYY-MM-DD (IST)
  recordingId: string,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    // Assignee: the lead's rep, else the first active sales/engineer, else
    // leadership — a task nobody owns nags nobody.
    let assignee = assignedStaff;
    if (!assignee) {
      const { data: fallback } = await supabase
        .from("users")
        .select("id, role")
        .eq("is_active", true)
        .in("role", ["sales", "engineer", "founder", "owner"])
        .order("role", { ascending: false }) // sales > owner > founder > engineer alphabetically reversed — good enough tiebreak
        .limit(10);
      const byRole = (r: string) => fallback?.find((u) => u.role === r)?.id;
      assignee =
        byRole("sales") ?? byRole("engineer") ?? byRole("founder") ?? byRole("owner") ?? null;
    }
    if (!assignee) return;

    const title = `📞 ${nextAction} — ${leadName}`.slice(0, 200);
    const dueAt = new Date(`${followUpDate}T10:00:00+05:30`).toISOString();

    // One open call-task per lead: update it if it exists, create otherwise.
    const { data: existing } = await supabase
      .from("work_items")
      .select("id")
      .eq("related_lead_id", leadId)
      .eq("source_module", "call_recording")
      .in("status", ["pending", "in_progress", "returned"])
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("work_items")
        .update({
          title,
          due_at: dueAt,
          assigned_user_id: assignee,
          source_record_id: recordingId,
          // Re-arm the nag engine for the fresh action/date.
          last_nudged_at: null,
          nudge_count: 0,
          escalated_at: null,
        })
        .eq("id", existing.id);
      logProgress(recordingId, "Next-action task updated", { task: title });
      return;
    }

    const { data: item, error: insErr } = await supabase
      .from("work_items")
      .insert({
        title,
        description: `Auto-created from the call recording. Next action agreed on the call: ${nextAction}`,
        activity_type: "simple",
        status: "pending",
        priority: "high",
        assigned_user_id: assignee,
        due_at: dueAt,
        related_lead_id: leadId,
        related_label: leadName,
        source_module: "call_recording",
        source_record_id: recordingId,
      })
      .select("*")
      .single();

    if (insErr || !item) {
      logError("Next-action task insert failed", insErr);
      return;
    }
    logProgress(recordingId, "Next-action task created", { task: title });
    const { notifyWorkAssigned } = await import("@/lib/my-work-notify");
    await notifyWorkAssigned(item as never);
  } catch (err) {
    logError("upsertNextActionTask failed (ignored)", err);
  }
}
