export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizePhoneForWhatsApp,
  buildWhatsAppUrl,
  type Lead,
  type Note,
} from "@maiyuri/shared";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Generate AI-powered WhatsApp response based on lead context
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Fetch lead details
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Fetch recent notes for context
    const { data: notes } = await supabaseAdmin
      .from("notes")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Generate appropriate response based on lead context
    const response = generateWhatsAppResponse(
      lead as Lead,
      (notes as Note[]) || [],
    );

    return NextResponse.json({
      data: {
        message: response.message,
        phoneNumber: normalizePhoneForWhatsApp(lead.contact),
        whatsappUrl: response.whatsappUrl,
      },
    });
  } catch (err) {
    console.error("Error generating WhatsApp response:", err);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}

function generateWhatsAppResponse(
  lead: Lead,
  notes: Note[],
): { message: string; whatsappUrl: string } {
  const customerName = lead.name.split(" ")[0]; // First name
  const statusMessages = getStatusBasedMessage(lead);
  const contextualInfo = getContextualInfo(lead, notes);

  // Build the message
  let message = `Hello ${customerName},\n\n`;
  message += statusMessages.greeting;

  if (contextualInfo) {
    message += `\n\n${contextualInfo}`;
  }

  message += statusMessages.callToAction;
  message += `\n\nBest regards,\nMaiyuri Bricks Team\n📞 For immediate assistance, call us anytime.`;

  // Use centralized phone normalization and URL building
  const whatsappUrl = buildWhatsAppUrl(lead.contact, message);

  return { message, whatsappUrl };
}

function getStatusBasedMessage(lead: Lead): {
  greeting: string;
  callToAction: string;
} {
  const requirementType = lead.requirement_type;

  switch (lead.status) {
    case "new":
      return {
        greeting: `Thank you for your interest in Maiyuri Bricks! We're excited to help you with your ${getRequirementLabel(requirementType)} project.`,
        callToAction: `\n\nWould you like to schedule a free consultation to discuss your requirements? We can also arrange a visit to our manufacturing facility.`,
      };

    case "follow_up":
      return {
        greeting: `Following up on our previous conversation about your ${getRequirementLabel(requirementType)} project.`,
        callToAction: lead.next_action
          ? `\n\nAs discussed, the next step is: ${lead.next_action}\n\nPlease let us know a convenient time to proceed.`
          : `\n\nPlease let us know if you have any questions or if you're ready to move forward.`,
      };

    case "hot":
      return {
        greeting: `Great news! We're ready to move forward with your ${getRequirementLabel(requirementType)} project.`,
        callToAction: `\n\nWe can prepare a detailed quotation for you right away. Our team is standing by to ensure quick delivery and installation.`,
      };

    case "cold":
      return {
        greeting: `We hope you're doing well! We wanted to check in regarding your ${getRequirementLabel(requirementType)} project inquiry.`,
        callToAction: `\n\nWe understand timing is important. Please feel free to reach out whenever you're ready - we'll be happy to assist you.`,
      };

    case "converted":
      return {
        greeting: `Thank you for choosing Maiyuri Bricks for your ${getRequirementLabel(requirementType)} project!`,
        callToAction: `\n\nWe're committed to delivering the best quality products. Please don't hesitate to contact us for any support or future requirements.`,
      };

    case "lost":
      return {
        greeting: `We appreciate you considering Maiyuri Bricks for your project.`,
        callToAction: `\n\nIf your requirements change or you need any assistance in the future, we'd be happy to help. Wishing you success with your project!`,
      };

    default:
      return {
        greeting: `Thank you for reaching out to Maiyuri Bricks!`,
        callToAction: `\n\nHow can we assist you with your construction needs today?`,
      };
  }
}

function getRequirementLabel(
  requirementType: string | null | undefined,
): string {
  switch (requirementType) {
    case "residential_house":
      return "residential house";
    case "commercial_building":
      return "commercial building";
    case "eco_friendly_building":
      return "eco-friendly building";
    case "compound_wall":
      return "compound wall";
    default:
      return "construction";
  }
}

function getContextualInfo(lead: Lead, notes: Note[]): string | null {
  const infoParts: string[] = [];

  // Add location context if available
  if (lead.site_region || lead.site_location) {
    const location = [lead.site_location, lead.site_region]
      .filter(Boolean)
      .join(", ");
    infoParts.push(`We understand your project is located in ${location}.`);
  }

  // Add quote information if available
  if (lead.odoo_quote_number && lead.odoo_quote_amount) {
    infoParts.push(
      `Your quotation (${lead.odoo_quote_number}) for ₹${lead.odoo_quote_amount.toLocaleString("en-IN")} is ready for your review.`,
    );
  }

  // Add follow-up date reminder
  if (lead.follow_up_date) {
    const followUpDate = new Date(lead.follow_up_date);
    const today = new Date();
    if (followUpDate >= today) {
      infoParts.push(
        `We have a follow-up scheduled for ${followUpDate.toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}.`,
      );
    }
  }

  // Add recent note context (if AI summary available)
  const recentNote = notes.find((n) => n.ai_summary);
  if (recentNote?.ai_summary) {
    infoParts.push(`From our last conversation: ${recentNote.ai_summary}`);
  }

  return infoParts.length > 0 ? infoParts.join(" ") : null;
}
