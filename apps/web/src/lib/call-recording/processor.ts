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
import { sendCallRecordingNotification, sendErrorNotification } from "./notifications";
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
): Promise<{ name: string; id: string } | null> {
  if (!leadId) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .select("id, name")
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
    await updateStatus(id, "uploading");
    logProgress(id, "Uploading to Google Drive");

    const lead = await getLeadDetails(lead_id);
    const driveResult = await uploadToGoogleDrive(
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
      const { data: currentLead } = await supabase
        .from("leads")
        .select(
          "lead_type, classification, requirement_type, product_interests, site_region, site_location, next_action, estimated_quantity, notes",
        )
        .eq("id", lead_id)
        .single();

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
        if (!currentLead.next_action && extractedDetails.next_action) {
          updates.next_action = extractedDetails.next_action;
        }
        if (!currentLead.estimated_quantity && extractedDetails.estimated_quantity) {
          updates.estimated_quantity = extractedDetails.estimated_quantity;
        }
        if (!currentLead.notes && extractedDetails.notes) {
          updates.notes = extractedDetails.notes;
        }

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
      driveUrl: driveResult.webViewLink,
      extractedDetails: extractedDetails ?? undefined,
      isNewlyAutoPopulated,
    });

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

    await updateStatus(id, "failed", {
      error_message: error instanceof Error ? error.message : String(error),
      retry_count: recording.retry_count + 1,
    });

    // Send error notification
    await sendErrorNotification(
      id,
      error instanceof Error ? error.message : String(error),
    ).catch(() => {});

    throw error;
  }
}
