/**
 * Issue #9: Processing Callback for Telegram Call Recordings
 *
 * Called by the Railway worker after transcription is complete.
 * If no lead is associated with the recording, attempts to extract
 * lead information from the transcription and create a new lead.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { z } from "zod";

const callbackSchema = z.object({
  recording_id: z.string().uuid(),
  transcription: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  error_message: z.string().optional(),
});

interface ExtractedLeadInfo {
  name: string | null;
  contact: string | null;
  source: string;
  lead_type: string | null;
  classification: string | null;
  requirement_type: string | null;
  site_region: string | null;
  site_location: string | null;
  next_action: string | null;
  missingFields: string[];
  confidence: number;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const secretHeader = request.headers.get("X-Webhook-Secret");
    const expectedSecret = process.env.PROCESSING_WEBHOOK_SECRET;

    if (expectedSecret && secretHeader !== expectedSecret) {
      console.warn("[Processing Callback] Invalid secret");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const body = await request.json();
    const parsed = callbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { recording_id, transcription, status, error_message } = parsed.data;

    // Get the recording details
    const { data: recording, error: fetchError } = await supabaseAdmin
      .from("call_recordings")
      .select("*, lead:leads(id, name)")
      .eq("id", recording_id)
      .single();

    if (fetchError || !recording) {
      console.error("[Processing Callback] Recording not found:", fetchError);
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 },
      );
    }

    // Update recording with transcription
    await supabaseAdmin
      .from("call_recordings")
      .update({
        transcription_text: transcription,
        processing_status: status,
        error_message: status === "failed" ? error_message : null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", recording_id);

    // If failed, notify via Telegram
    if (status === "failed") {
      if (recording.telegram_chat_id) {
        await sendTelegramMessage(
          `❌ *Processing Failed*\n\n` +
            `📁 File: ${recording.original_filename}\n` +
            `Error: ${error_message || "Unknown error"}\n\n` +
            `Please retry or contact support.`,
          recording.telegram_chat_id.toString(),
        );
      }
      return NextResponse.json({ ok: true, status: "failed" });
    }

    // If recording already has a lead, just send success notification
    if (recording.lead_id && recording.lead) {
      if (recording.telegram_chat_id) {
        await sendTelegramMessage(
          `✅ *Transcription Complete*\n\n` +
            `👤 *Lead:* ${recording.lead.name}\n` +
            `📱 *Phone:* ${recording.phone_number}\n\n` +
            `📝 *Summary:*\n${truncateText(transcription, 500)}\n\n` +
            `View full details in the dashboard.`,
          recording.telegram_chat_id.toString(),
        );
      }
      return NextResponse.json({ ok: true, lead_id: recording.lead_id });
    }

    // No lead associated - attempt to extract lead info from transcription
    console.warn(
      "[Processing Callback] No lead found, extracting from transcription...",
    );

    const extractedInfo = extractLeadInfoFromTranscription(
      transcription,
      recording.phone_number,
    );

    // Check if we have enough information to create a lead
    if (extractedInfo.missingFields.length === 0) {
      // Create the lead automatically
      const { data: newLead, error: createError } = await supabaseAdmin
        .from("leads")
        .insert({
          name: extractedInfo.name,
          contact: extractedInfo.contact || recording.phone_number,
          source: extractedInfo.source,
          lead_type: extractedInfo.lead_type || "Other",
          status: "new",
          classification: extractedInfo.classification,
          requirement_type: extractedInfo.requirement_type,
          site_region: extractedInfo.site_region,
          site_location: extractedInfo.site_location,
          next_action: extractedInfo.next_action,
        })
        .select()
        .single();

      if (createError) {
        console.error(
          "[Processing Callback] Failed to create lead:",
          createError,
        );
      } else {
        // Update recording with new lead ID
        await supabaseAdmin
          .from("call_recordings")
          .update({ lead_id: newLead.id })
          .eq("id", recording_id);

        // Notify via Telegram
        if (recording.telegram_chat_id) {
          await sendTelegramMessage(
            `✅ *Lead Created from Call!*\n\n` +
              `👤 *Name:* ${newLead.name}\n` +
              `📱 *Phone:* ${newLead.contact}\n` +
              `🏷️ *Type:* ${newLead.lead_type}\n` +
              `📊 *Classification:* ${formatClassification(newLead.classification)}\n` +
              (newLead.site_region
                ? `📍 *Region:* ${newLead.site_region}\n`
                : "") +
              (newLead.next_action
                ? `📋 *Next Action:* ${newLead.next_action}\n`
                : "") +
              `\n📊 *Confidence:* ${extractedInfo.confidence}%\n\n` +
              `📝 *Call Summary:*\n${truncateText(transcription, 300)}`,
            recording.telegram_chat_id.toString(),
          );
        }

        return NextResponse.json({
          ok: true,
          action: "lead_created",
          lead_id: newLead.id,
        });
      }
    }

    // Missing required fields - ask for input via Telegram
    if (recording.telegram_chat_id) {
      const message = generateMissingFieldsMessage(
        extractedInfo,
        transcription,
        recording_id,
      );
      await sendTelegramMessage(message, recording.telegram_chat_id.toString());
    }

    return NextResponse.json({
      ok: true,
      action: "needs_input",
      extractedInfo,
      recording_id,
    });
  } catch (error) {
    console.error("[Processing Callback] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function extractLeadInfoFromTranscription(
  transcription: string,
  phoneNumber?: string,
): ExtractedLeadInfo {
  const lowerText = transcription.toLowerCase();
  const missingFields: string[] = [];

  // Extract name - look for common patterns
  let name: string | null = null;
  const namePatterns = [
    /(?:my name is|i am|this is|i'm|நான்)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:name[:\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:speaking|calling)\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];
  for (const pattern of namePatterns) {
    const match = transcription.match(pattern);
    if (match) {
      name = match[1].trim();
      break;
    }
  }

  // Extract lead type based on keywords
  let lead_type: string | null = null;
  if (
    lowerText.includes("commercial") ||
    lowerText.includes("office") ||
    lowerText.includes("shop") ||
    lowerText.includes("கடை")
  ) {
    lead_type = "Commercial";
  } else if (
    lowerText.includes("residential") ||
    lowerText.includes("house") ||
    lowerText.includes("home") ||
    lowerText.includes("வீடு")
  ) {
    lead_type = "Residential";
  } else if (
    lowerText.includes("industrial") ||
    lowerText.includes("factory") ||
    lowerText.includes("warehouse") ||
    lowerText.includes("தொழிற்சாலை")
  ) {
    lead_type = "Industrial";
  } else if (
    lowerText.includes("government") ||
    lowerText.includes("tender") ||
    lowerText.includes("அரசு")
  ) {
    lead_type = "Government";
  }

  // Extract classification
  let classification: string | null = null;
  if (
    lowerText.includes("builder") ||
    lowerText.includes("contractor") ||
    lowerText.includes("கட்டுமான")
  ) {
    classification = "builder";
  } else if (
    lowerText.includes("dealer") ||
    lowerText.includes("distributor") ||
    lowerText.includes("டீலர்")
  ) {
    classification = "dealer";
  } else if (
    lowerText.includes("architect") ||
    lowerText.includes("கட்டிடக்கலைஞர்")
  ) {
    classification = "architect";
  } else if (lowerText.includes("vendor") || lowerText.includes("supplier")) {
    classification = "vendor";
  } else {
    classification = "direct_customer";
  }

  // Extract requirement type
  let requirement_type: string | null = null;
  if (
    lowerText.includes("house") ||
    lowerText.includes("home") ||
    lowerText.includes("residential") ||
    lowerText.includes("வீடு")
  ) {
    requirement_type = "residential_house";
  } else if (
    lowerText.includes("commercial") ||
    lowerText.includes("building") ||
    lowerText.includes("office") ||
    lowerText.includes("கட்டிடம்")
  ) {
    requirement_type = "commercial_building";
  } else if (
    lowerText.includes("eco") ||
    lowerText.includes("green") ||
    lowerText.includes("sustainable")
  ) {
    requirement_type = "eco_friendly_building";
  } else if (
    lowerText.includes("compound") ||
    lowerText.includes("wall") ||
    lowerText.includes("boundary") ||
    lowerText.includes("சுவர்")
  ) {
    requirement_type = "compound_wall";
  }

  // Extract location - Tamil Nadu regions
  let site_region: string | null = null;
  let site_location: string | null = null;

  const regions = [
    "chennai",
    "coimbatore",
    "madurai",
    "salem",
    "trichy",
    "tirupur",
    "kanchipuram",
    "vellore",
    "erode",
    "thanjavur",
    "tirunelveli",
    "dindigul",
    "karur",
    "namakkal",
    "cuddalore",
    "pondicherry",
    "சென்னை",
    "கோவை",
    "மதுரை",
    "சேலம்",
    "திருச்சி",
  ];
  for (const region of regions) {
    if (lowerText.includes(region)) {
      // Capitalize properly
      site_region = region.charAt(0).toUpperCase() + region.slice(1);
      if (site_region === "சென்னை") site_region = "Chennai";
      if (site_region === "கோவை") site_region = "Coimbatore";
      if (site_region === "மதுரை") site_region = "Madurai";
      if (site_region === "சேலம்") site_region = "Salem";
      if (site_region === "திருச்சி") site_region = "Trichy";
      break;
    }
  }

  // Extract Chennai areas
  const chennaiAreas = [
    "t nagar",
    "anna nagar",
    "adyar",
    "velachery",
    "porur",
    "ambattur",
    "tambaram",
    "perungudi",
    "omr",
    "ecr",
    "guindy",
    "mount road",
    "egmore",
    "nungambakkam",
    "mylapore",
    "chromepet",
    "pallavaram",
  ];
  for (const area of chennaiAreas) {
    if (lowerText.includes(area)) {
      site_location = area
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      break;
    }
  }

  // Extract next action from context
  let next_action: string | null = null;
  if (
    lowerText.includes("visit") ||
    lowerText.includes("come") ||
    lowerText.includes("site")
  ) {
    next_action = "Schedule site visit";
  } else if (
    lowerText.includes("quote") ||
    lowerText.includes("price") ||
    lowerText.includes("cost") ||
    lowerText.includes("விலை")
  ) {
    next_action = "Prepare quotation";
  } else if (
    lowerText.includes("call back") ||
    lowerText.includes("call again") ||
    lowerText.includes("discuss")
  ) {
    next_action = "Follow-up call";
  } else if (lowerText.includes("sample") || lowerText.includes("மாதிரி")) {
    next_action = "Send product samples";
  } else if (
    lowerText.includes("catalog") ||
    lowerText.includes("catalogue") ||
    lowerText.includes("brochure")
  ) {
    next_action = "Send catalog";
  }

  // Determine missing required fields
  if (!name) missingFields.push("name");
  if (!phoneNumber) missingFields.push("contact");

  // Calculate confidence based on extracted fields
  const totalFields = 8;
  const extractedCount = [
    name,
    lead_type,
    classification,
    requirement_type,
    site_region,
    site_location,
    next_action,
    phoneNumber,
  ].filter(Boolean).length;
  const confidence = Math.round((extractedCount / totalFields) * 100);

  return {
    name,
    contact: phoneNumber || null,
    source: "Telegram",
    lead_type,
    classification,
    requirement_type,
    site_region,
    site_location,
    next_action,
    missingFields,
    confidence,
  };
}

function generateMissingFieldsMessage(
  info: ExtractedLeadInfo,
  transcription: string,
  recordingId: string,
): string {
  const parts: string[] = ["📋 *New Lead Detected from Call*\n"];

  parts.push("Based on the conversation, I extracted:\n");

  if (info.contact) parts.push(`• 📱 Contact: ${info.contact}`);
  if (info.lead_type) parts.push(`• 🏷️ Type: ${info.lead_type}`);
  if (info.classification)
    parts.push(
      `• 👤 Classification: ${formatClassification(info.classification)}`,
    );
  if (info.requirement_type)
    parts.push(
      `• 🏗️ Requirement: ${info.requirement_type?.replace(/_/g, " ")}`,
    );
  if (info.site_region) parts.push(`• 📍 Region: ${info.site_region}`);
  if (info.site_location) parts.push(`• 📌 Location: ${info.site_location}`);
  if (info.next_action) parts.push(`• 📋 Next Action: ${info.next_action}`);

  parts.push(`\n📊 *Confidence:* ${info.confidence}%`);

  if (info.missingFields.length > 0) {
    parts.push(`\n⚠️ *Missing required fields:*`);
    info.missingFields.forEach((field) => {
      parts.push(`• ${field}`);
    });
    parts.push(`\n💡 *Reply with the customer name to create lead:*`);
    parts.push(`\`NAME: [Customer Name]\``);
    parts.push(`\n_Recording ID: ${recordingId}_`);
  }

  parts.push(`\n📝 *Call Summary:*\n${truncateText(transcription, 300)}`);

  return parts.join("\n");
}

function formatClassification(classification: string | null): string {
  if (!classification) return "Unknown";
  const labels: Record<string, string> = {
    direct_customer: "Direct Customer",
    builder: "Builder/Contractor",
    dealer: "Dealer/Distributor",
    architect: "Architect",
    vendor: "Vendor",
  };
  return labels[classification] || classification;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}
