/**
 * Issue #9: Extract lead details from call transcription
 *
 * Uses AI to extract lead information from a call transcription
 * and creates a new lead or updates an existing one.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
    const body = await request.json();
    const { transcription, phone_number, recording_id } = body;

    if (!transcription) {
      return NextResponse.json(
        { error: "Transcription is required" },
        { status: 400 },
      );
    }

    // Extract lead information from transcription
    const extractedInfo = extractLeadInfoFromTranscription(
      transcription,
      phone_number,
    );

    // Check if we have enough information to create a lead
    if (extractedInfo.missingFields.length === 0) {
      // Create the lead automatically
      const { data: lead, error: createError } = await supabaseAdmin
        .from("leads")
        .insert({
          name: extractedInfo.name,
          contact: extractedInfo.contact || phone_number,
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
        console.error("[Extract Lead] Create error:", createError);
        return NextResponse.json(
          { error: "Failed to create lead" },
          { status: 500 },
        );
      }

      // Update the call recording with the new lead ID
      if (recording_id) {
        await supabaseAdmin
          .from("call_recordings")
          .update({ lead_id: lead.id })
          .eq("id", recording_id);
      }

      return NextResponse.json({
        data: {
          action: "created",
          lead,
          extractedInfo,
        },
      });
    }

    // Return extracted info with missing fields for user to provide
    return NextResponse.json({
      data: {
        action: "needs_input",
        extractedInfo,
        message: generateMissingFieldsMessage(extractedInfo),
      },
    });
  } catch (error) {
    console.error("[Extract Lead] Error:", error);
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
    /(?:my name is|i am|this is|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:name[:\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
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
    lowerText.includes("shop")
  ) {
    lead_type = "Commercial";
  } else if (
    lowerText.includes("residential") ||
    lowerText.includes("house") ||
    lowerText.includes("home")
  ) {
    lead_type = "Residential";
  } else if (
    lowerText.includes("industrial") ||
    lowerText.includes("factory") ||
    lowerText.includes("warehouse")
  ) {
    lead_type = "Industrial";
  } else if (lowerText.includes("government") || lowerText.includes("tender")) {
    lead_type = "Government";
  }

  // Extract classification
  let classification: string | null = null;
  if (lowerText.includes("builder") || lowerText.includes("contractor")) {
    classification = "builder";
  } else if (
    lowerText.includes("dealer") ||
    lowerText.includes("distributor")
  ) {
    classification = "dealer";
  } else if (lowerText.includes("architect")) {
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
    lowerText.includes("residential")
  ) {
    requirement_type = "residential_house";
  } else if (
    lowerText.includes("commercial") ||
    lowerText.includes("building") ||
    lowerText.includes("office")
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
    lowerText.includes("boundary")
  ) {
    requirement_type = "compound_wall";
  }

  // Extract location - look for Tamil Nadu regions
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
  ];
  for (const region of regions) {
    if (lowerText.includes(region)) {
      site_region = region.charAt(0).toUpperCase() + region.slice(1);
      break;
    }
  }

  // Extract specific locations within Chennai
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
  if (lowerText.includes("visit") || lowerText.includes("come")) {
    next_action = "Schedule site visit";
  } else if (
    lowerText.includes("quote") ||
    lowerText.includes("price") ||
    lowerText.includes("cost")
  ) {
    next_action = "Prepare quotation";
  } else if (lowerText.includes("call") || lowerText.includes("discuss")) {
    next_action = "Follow-up call";
  } else if (lowerText.includes("sample")) {
    next_action = "Send product samples";
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

function generateMissingFieldsMessage(info: ExtractedLeadInfo): string {
  const parts: string[] = ["📋 *New Lead Detected*\n"];

  parts.push("Based on the call, I extracted:\n");

  if (info.contact) parts.push(`• Contact: ${info.contact}`);
  if (info.name) parts.push(`• Name: ${info.name}`);
  if (info.lead_type) parts.push(`• Type: ${info.lead_type}`);
  if (info.classification)
    parts.push(`• Classification: ${info.classification}`);
  if (info.requirement_type)
    parts.push(`• Requirement: ${info.requirement_type?.replace(/_/g, " ")}`);
  if (info.site_region) parts.push(`• Region: ${info.site_region}`);
  if (info.site_location) parts.push(`• Location: ${info.site_location}`);

  parts.push(`\n📊 Confidence: ${info.confidence}%`);

  if (info.missingFields.length > 0) {
    parts.push(`\n⚠️ *Missing required fields:*`);
    info.missingFields.forEach((field) => {
      parts.push(`• ${field}`);
    });
    parts.push(`\nPlease reply with: NAME: [customer name]`);
  } else {
    parts.push(`\n✅ All required fields extracted. Creating lead...`);
  }

  return parts.join("\n");
}
