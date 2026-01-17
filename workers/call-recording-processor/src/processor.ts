/**
 * Call Recording Processor
 *
 * Main processing pipeline for call recordings.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { convertAudioToMp3 } from "./audio-converter.js";
import { uploadToGoogleDrive } from "./gdrive-storage.js";
import { transcribeAudio } from "./transcription.js";
import {
  analyzeTranscript,
  extractLeadDetails,
  type ExtractedLeadDetails,
} from "./analysis.js";
import { sendTelegramNotification } from "./notifications.js";
import { logError, logProgress } from "./logger.js";

// Types
interface CallRecording {
  id: string;
  lead_id: string | null;
  phone_number: string;
  telegram_file_id: string;
  telegram_chat_id: number;
  original_filename: string;
  processing_status: string;
  retry_count: number;
}

type ProcessingStatus =
  | "pending"
  | "downloading"
  | "converting"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";

/**
 * Update recording status in database
 */
async function updateStatus(
  supabase: SupabaseClient,
  recordingId: string,
  status: ProcessingStatus,
  additionalFields?: Record<string, unknown>,
): Promise<void> {
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
  const botToken = process.env.TELEGRAM_BOT_TOKEN!;

  // Get file path
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

  // Download file
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
  const downloadResponse = await fetch(downloadUrl);

  if (!downloadResponse.ok) {
    throw new Error(`Failed to download file: ${downloadResponse.status}`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get lead details for notifications
 */
async function getLeadDetails(
  supabase: SupabaseClient,
  leadId: string | null,
): Promise<{ name: string; id: string } | null> {
  if (!leadId) return null;

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
  supabase: SupabaseClient,
  recording: CallRecording,
): Promise<void> {
  const {
    id,
    telegram_file_id,
    phone_number,
    lead_id,
    telegram_chat_id,
    original_filename,
  } = recording;

  logProgress(id, "Starting processing", {
    phone: phone_number,
    filename: original_filename,
  });

  try {
    // ========================================
    // Stage 1: Download from Telegram
    // ========================================
    await updateStatus(supabase, id, "downloading");
    logProgress(id, "Downloading from Telegram");

    const audioBuffer = await downloadFromTelegram(telegram_file_id);
    logProgress(id, "Downloaded", { size: audioBuffer.length });

    // ========================================
    // Stage 2: Convert to MP3
    // ========================================
    await updateStatus(supabase, id, "converting");
    logProgress(id, "Converting to MP3");

    const { mp3Buffer, durationSeconds } = await convertAudioToMp3(audioBuffer);
    logProgress(id, "Converted", {
      duration: durationSeconds,
      size: mp3Buffer.length,
    });

    await updateStatus(supabase, id, "converting", {
      duration_seconds: durationSeconds,
    });

    // ========================================
    // Stage 3: Upload to Google Drive
    // ========================================
    await updateStatus(supabase, id, "uploading");
    logProgress(id, "Uploading to Google Drive");

    const lead = await getLeadDetails(supabase, lead_id);
    const driveResult = await uploadToGoogleDrive(
      mp3Buffer,
      phone_number,
      original_filename,
      lead?.name,
    );

    logProgress(id, "Uploaded to Drive", { fileId: driveResult.fileId });

    await updateStatus(supabase, id, "uploading", {
      mp3_gdrive_file_id: driveResult.fileId,
      mp3_gdrive_url: driveResult.webViewLink,
    });

    // ========================================
    // Stage 4: Transcribe with Gemini
    // ========================================
    await updateStatus(supabase, id, "transcribing");
    logProgress(id, "Transcribing with Gemini");

    const transcription = await transcribeAudio(mp3Buffer, original_filename);
    logProgress(id, "Transcribed", {
      language: transcription.language,
      confidence: transcription.confidence,
      length: transcription.text.length,
    });

    await updateStatus(supabase, id, "transcribing", {
      transcription_text: transcription.text,
      transcription_language: transcription.language,
      transcription_confidence: transcription.confidence,
    });

    // ========================================
    // Stage 5: AI Analysis
    // ========================================
    await updateStatus(supabase, id, "analyzing");
    logProgress(id, "Running AI analysis");

    const analysis = await analyzeTranscript(
      transcription.text,
      phone_number,
      lead?.name,
    );
    logProgress(id, "Analysis complete", {
      sentiment: analysis.insights.sentiment,
      hasRecommendations:
        (analysis.insights.recommended_actions?.length || 0) > 0,
    });

    await updateStatus(supabase, id, "analyzing", {
      ai_summary: analysis.summary,
      ai_insights: analysis.insights,
      ai_score_impact: analysis.scoreImpact,
    });

    // ========================================
    // Stage 5b: Extract Lead Details from Transcription
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

      // Update lead with extracted fields (only if fields are currently empty)
      const { data: currentLead } = await supabase
        .from("leads")
        .select(
          "lead_type, classification, requirement_type, site_region, site_location, next_action, estimated_quantity, notes",
        )
        .eq("id", lead_id)
        .single();

      if (currentLead) {
        const updates: Record<string, unknown> = {};

        // Only update fields that are currently null/empty or have default values
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
        if (
          !currentLead.requirement_type &&
          extractedDetails.requirement_type
        ) {
          updates.requirement_type = extractedDetails.requirement_type;
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
        if (
          !currentLead.estimated_quantity &&
          extractedDetails.estimated_quantity
        ) {
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
    // Stage 6: Send Telegram Notification
    // ========================================
    logProgress(id, "Sending notification");

    await sendTelegramNotification(telegram_chat_id.toString(), {
      leadName: lead?.name,
      leadId: lead?.id,
      phoneNumber: phone_number,
      duration: durationSeconds,
      summary: analysis.summary,
      insights: analysis.insights,
      scoreImpact: analysis.scoreImpact,
      driveUrl: driveResult.webViewLink,
      extractedDetails: extractedDetails || undefined,
      isNewlyAutoPopulated,
    });

    // ========================================
    // Mark as completed
    // ========================================
    await updateStatus(supabase, id, "completed", {
      processed_at: new Date().toISOString(),
    });

    logProgress(id, "Processing completed successfully");
  } catch (error) {
    logError(`Processing failed for ${id}`, error);

    // Update status to failed
    await updateStatus(supabase, id, "failed", {
      error_message: error instanceof Error ? error.message : String(error),
      retry_count: recording.retry_count + 1,
    });

    // Re-throw if not retryable
    throw error;
  }
}
