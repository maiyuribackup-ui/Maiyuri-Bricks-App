/**
 * Telegram Webhook Handler for Call Recording Intake
 *
 * Receives audio files from Telegram, extracts phone number from filename,
 * maps to lead, and queues for processing by Railway worker.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import {
  extractFromFilename,
  normalizePhoneNumber,
  findMostRecentLead,
  type TelegramUpdate,
} from "@/lib/telegram-webhook";

// Environment configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ALLOWED_CHAT_IDS =
  process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(",").map(Number) || [];

/**
 * POST /api/telegram/webhook
 * Receives updates from Telegram Bot API
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (TELEGRAM_WEBHOOK_SECRET && secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
      console.warn("[Telegram Webhook] Invalid secret token");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update: TelegramUpdate = await request.json();
    console.warn(
      "[Telegram Webhook] Received update:",
      JSON.stringify(update, null, 2),
    );

    // Only process message updates
    if (!update.message) {
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id;

    // Verify chat ID is whitelisted (if configured)
    if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
      console.warn(`[Telegram Webhook] Unauthorized chat: ${chatId}`);
      return NextResponse.json({ ok: true }); // Don't reveal we ignored it
    }

    // Check for text message - could be a reply with missing field info
    if (message.text && !message.voice && !message.audio && !message.document) {
      return await handleTextMessage(message.text, chatId);
    }

    // Check for audio content (voice, audio, or document)
    const audio =
      message.voice ||
      message.audio ||
      (message.document?.mime_type?.startsWith("audio/")
        ? message.document
        : null);

    if (!audio) {
      // Silently ignore non-audio messages
      return NextResponse.json({ ok: true });
    }

    // Get filename for phone number and name extraction
    const filename =
      message.document?.file_name ||
      message.audio?.file_name ||
      `voice_${message.message_id}.ogg`;

    // Extract phone number AND name from filename
    const { phone: extractedPhone, name: extractedName } =
      extractFromFilename(filename);

    if (!extractedPhone) {
      // Notify user about filename requirement
      await sendTelegramMessage(
        `❌ *Phone Number Not Found*\n\nCould not extract phone number from filename:\n\`${filename}\`\n\n` +
          `Please rename the file to include the phone number, e.g.:\n` +
          `• \`Robin_Avadi_9876543210.wav\`\n` +
          `• \`Superfone_9876543210_20260115.wav\`\n` +
          `• \`Call_+919876543210.wav\``,
        chatId.toString(),
      );
      return NextResponse.json({ ok: true });
    }

    const normalizedPhone = normalizePhoneNumber(extractedPhone);

    // Check for duplicate (by telegram_file_id)
    const { data: existing } = await supabaseAdmin
      .from("call_recordings")
      .select("id")
      .eq("telegram_file_id", audio.file_id)
      .single();

    if (existing) {
      console.warn(`[Telegram Webhook] Duplicate file: ${audio.file_id}`);
      await sendTelegramMessage(
        `⚠️ *Duplicate Recording*\n\nThis recording has already been uploaded.`,
        chatId.toString(),
      );
      return NextResponse.json({ ok: true });
    }

    // Find the most recent lead matching this phone number
    let lead = await findMostRecentLead(normalizedPhone);
    let isNewLead = false;

    // AUTO-CREATE LEAD if no match found and we have a name
    if (!lead && extractedName) {
      const { data: newLead, error: createError } = await supabaseAdmin
        .from("leads")
        .insert({
          name: extractedName,
          contact: normalizedPhone,
          source: "Telegram",
          status: "new",
          // These will be updated after transcription analysis
          lead_type: "Other",
          classification: "direct_customer",
        })
        .select()
        .single();

      if (createError) {
        console.error(
          "[Telegram Webhook] Failed to auto-create lead:",
          createError,
        );
        // Continue without lead - will be created manually later
      } else {
        lead = newLead;
        isNewLead = true;
        console.warn(
          `[Telegram Webhook] Auto-created lead: ${newLead.id} for ${extractedName}`,
        );
      }
    }

    // Insert call recording record with 'pending' status
    const { data: recording, error: insertError } = await supabaseAdmin
      .from("call_recordings")
      .insert({
        lead_id: lead?.id || null,
        phone_number: normalizedPhone,
        telegram_file_id: audio.file_id,
        telegram_message_id: message.message_id,
        telegram_chat_id: chatId,
        telegram_user_id: message.from?.id || null,
        original_filename: filename,
        file_size_bytes: audio.file_size || null,
        processing_status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[Telegram Webhook] Insert error:", insertError);
      await sendTelegramMessage(
        `❌ *Upload Error*\n\nFailed to save recording. Please try again later.`,
        chatId.toString(),
      );
      return NextResponse.json(
        { ok: false, error: "Database error" },
        { status: 500 },
      );
    }

    // Build confirmation message based on scenario
    let confirmMessage: string;

    if (lead && isNewLead) {
      // New lead auto-created from filename
      confirmMessage =
        `📞 *Call Recording Received*\n\n` +
        `✨ *New Lead Created!*\n` +
        `👤 *Name:* ${lead.name}\n` +
        `📱 *Phone:* ${normalizedPhone}\n` +
        `📁 *File:* ${filename}\n\n` +
        `⏳ Processing transcription...\n` +
        `_Lead details will be auto-populated after analysis._`;
    } else if (lead) {
      // Existing lead found
      confirmMessage =
        `📞 *Call Recording Received*\n\n` +
        `👤 *Lead:* ${lead.name}\n` +
        `📱 *Phone:* ${normalizedPhone}\n` +
        `📁 *File:* ${filename}\n\n` +
        `⏳ Processing will begin shortly...`;
    } else {
      // No lead found and couldn't extract name
      confirmMessage =
        `📞 *Call Recording Received*\n\n` +
        `📱 *Phone:* ${normalizedPhone}\n` +
        `📁 *File:* ${filename}\n\n` +
        `⚠️ Could not extract customer name from filename.\n` +
        `Reply with \`NAME: Customer Name\` to create a lead.\n\n` +
        `⏳ Processing will begin shortly...`;
    }

    await sendTelegramMessage(confirmMessage, chatId.toString());

    console.warn(
      `[Telegram Webhook] Recording queued: ${recording.id} for phone ${normalizedPhone}`,
    );

    return NextResponse.json({ ok: true, recording_id: recording.id });
  } catch (error) {
    console.error("[Telegram Webhook] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/telegram/webhook
 * Health check and webhook info
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    webhook: "telegram-call-recording",
    configured: Boolean(TELEGRAM_BOT_TOKEN),
    allowed_chats: ALLOWED_CHAT_IDS.length,
  });
}

/**
 * Handle text messages - process missing field inputs for lead creation
 * Supports formats:
 * - NAME: John Doe
 * - name: John Doe
 * - Recording ID: <uuid>
 */
async function handleTextMessage(
  messageText: string,
  chatId: number,
): Promise<NextResponse> {
  const text = messageText.trim();

  // Check for NAME: pattern
  const nameMatch = text.match(/^(?:NAME|name|Name)[:\s]+(.+)$/i);

  if (!nameMatch) {
    // Not a lead creation command - silently ignore
    return NextResponse.json({ ok: true });
  }

  const customerName = nameMatch[1].trim();

  if (customerName.length < 2) {
    await sendTelegramMessage(
      `⚠️ Please provide a valid name (at least 2 characters).`,
      chatId.toString(),
    );
    return NextResponse.json({ ok: true });
  }

  // Find the most recent recording from this chat that needs a lead
  const { data: pendingRecording, error: fetchError } = await supabaseAdmin
    .from("call_recordings")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .is("lead_id", null)
    .eq("processing_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !pendingRecording) {
    await sendTelegramMessage(
      `❌ *No Pending Lead*\n\n` +
        `I couldn't find a recent call recording without a lead.\n` +
        `Please upload a call recording first, then provide the customer name.`,
      chatId.toString(),
    );
    return NextResponse.json({ ok: true });
  }

  // Extract additional info from the transcription if available
  let leadType = "Other";
  let classification = "direct_customer";
  let requirementType: string | null = null;
  let siteRegion: string | null = null;
  let nextAction: string | null = null;

  if (pendingRecording.transcription_text) {
    const lowerText = pendingRecording.transcription_text.toLowerCase();

    // Extract lead type
    if (
      lowerText.includes("commercial") ||
      lowerText.includes("office") ||
      lowerText.includes("shop")
    ) {
      leadType = "Commercial";
    } else if (
      lowerText.includes("residential") ||
      lowerText.includes("house") ||
      lowerText.includes("home")
    ) {
      leadType = "Residential";
    } else if (
      lowerText.includes("industrial") ||
      lowerText.includes("factory")
    ) {
      leadType = "Industrial";
    } else if (
      lowerText.includes("government") ||
      lowerText.includes("tender")
    ) {
      leadType = "Government";
    }

    // Extract classification
    if (lowerText.includes("builder") || lowerText.includes("contractor")) {
      classification = "builder";
    } else if (
      lowerText.includes("dealer") ||
      lowerText.includes("distributor")
    ) {
      classification = "dealer";
    } else if (lowerText.includes("architect")) {
      classification = "architect";
    }

    // Extract requirement type
    if (lowerText.includes("house") || lowerText.includes("residential")) {
      requirementType = "residential_house";
    } else if (
      lowerText.includes("commercial") ||
      lowerText.includes("building")
    ) {
      requirementType = "commercial_building";
    } else if (lowerText.includes("compound") || lowerText.includes("wall")) {
      requirementType = "compound_wall";
    }

    // Extract region
    const regions = [
      "chennai",
      "coimbatore",
      "madurai",
      "salem",
      "trichy",
      "tirupur",
    ];
    for (const region of regions) {
      if (lowerText.includes(region)) {
        siteRegion = region.charAt(0).toUpperCase() + region.slice(1);
        break;
      }
    }

    // Extract next action
    if (lowerText.includes("visit") || lowerText.includes("site")) {
      nextAction = "Schedule site visit";
    } else if (lowerText.includes("quote") || lowerText.includes("price")) {
      nextAction = "Prepare quotation";
    } else if (lowerText.includes("sample")) {
      nextAction = "Send product samples";
    }
  }

  // Create the lead
  const { data: newLead, error: createError } = await supabaseAdmin
    .from("leads")
    .insert({
      name: customerName,
      contact: pendingRecording.phone_number,
      source: "Telegram",
      lead_type: leadType,
      status: "new",
      classification: classification,
      requirement_type: requirementType,
      site_region: siteRegion,
      next_action: nextAction,
    })
    .select()
    .single();

  if (createError) {
    console.error("[Telegram Webhook] Failed to create lead:", createError);
    await sendTelegramMessage(
      `❌ *Failed to Create Lead*\n\n` +
        `Error: ${createError.message}\n` +
        `Please try again or create manually in the dashboard.`,
      chatId.toString(),
    );
    return NextResponse.json({ ok: true });
  }

  // Update recording with new lead ID
  await supabaseAdmin
    .from("call_recordings")
    .update({ lead_id: newLead.id })
    .eq("id", pendingRecording.id);

  // Success notification
  const formatLabel = (s: string) => s?.replace(/_/g, " ") || "";
  await sendTelegramMessage(
    `✅ *Lead Created Successfully!*\n\n` +
      `👤 *Name:* ${newLead.name}\n` +
      `📱 *Phone:* ${newLead.contact}\n` +
      `🏷️ *Type:* ${newLead.lead_type}\n` +
      `👥 *Classification:* ${formatLabel(newLead.classification)}\n` +
      (newLead.requirement_type
        ? `🏗️ *Requirement:* ${formatLabel(newLead.requirement_type)}\n`
        : "") +
      (newLead.site_region ? `📍 *Region:* ${newLead.site_region}\n` : "") +
      (newLead.next_action
        ? `📋 *Next Action:* ${newLead.next_action}\n`
        : "") +
      `\n✨ The lead has been linked to the call recording.`,
    chatId.toString(),
  );

  console.warn(
    `[Telegram Webhook] Lead created: ${newLead.id} for recording ${pendingRecording.id}`,
  );

  return NextResponse.json({ ok: true, lead_id: newLead.id });
}
