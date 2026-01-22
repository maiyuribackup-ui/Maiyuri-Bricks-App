/**
 * Telegram Webhook Helpers
 *
 * Utility functions for processing Telegram call recording uploads.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Lead } from "@maiyuri/shared";

// ============================================================================
// Telegram Types
// ============================================================================

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  audio?: TelegramAudio;
  voice?: TelegramVoice;
  document?: TelegramDocument;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ============================================================================
// Filename Extraction (Phone & Name)
// ============================================================================

/**
 * Result of extracting info from filename
 */
export interface FilenameExtraction {
  phone: string | null;
  name: string | null;
}

/**
 * Extract both phone number AND customer name from filename
 *
 * Supports formats:
 * - Robin_Avadi_9876543210.wav → { name: "Robin Avadi", phone: "9876543210" }
 * - Superfone_John_Doe_9876543210_20260115.wav → { name: "John Doe", phone: "9876543210" }
 * - Call_CustomerName_+919876543210.wav → { name: "CustomerName", phone: "9876543210" }
 * - 9876543210_Ravi_Kumar.wav → { name: "Ravi Kumar", phone: "9876543210" }
 */
export function extractFromFilename(filename: string): FilenameExtraction {
  const phone = extractPhoneFromFilename(filename);
  const name = extractNameFromFilename(filename);
  return { phone, name };
}

/**
 * Extract customer name from filename
 *
 * Strategy:
 * 1. Remove file extension
 * 2. Remove phone numbers, dates, common prefixes
 * 3. Convert underscores/hyphens to spaces
 * 4. Clean up and title case the remaining text
 */
export function extractNameFromFilename(filename: string): string | null {
  // Remove file extension
  let name = filename.replace(/\.[^.]+$/, "");

  // Remove common prefixes (case-insensitive)
  const prefixes = [
    "superfone",
    "call",
    "recording",
    "audio",
    "voice",
    "rec",
    "whatsapp",
    "wa",
  ];
  for (const prefix of prefixes) {
    name = name.replace(new RegExp(`^${prefix}[_\\-\\s]*`, "i"), "");
  }

  // Remove phone numbers (10-12 digits with optional +91 prefix)
  name = name.replace(/\+?91?[_\-\s]?[6-9]\d{9}/g, "");
  name = name.replace(/[6-9]\d{9}/g, "");

  // Remove date patterns (YYYYMMDD, YYYY-MM-DD, DD-MM-YYYY, etc.)
  name = name.replace(/\d{4}[-_]?\d{2}[-_]?\d{2}/g, "");
  name = name.replace(/\d{2}[-_]\d{2}[-_]\d{4}/g, "");

  // Remove time patterns (HHMMSS, HH-MM-SS)
  name = name.replace(/\d{2}[-_]?\d{2}[-_]?\d{2}/g, "");

  // Remove standalone numbers
  name = name.replace(/\b\d+\b/g, "");

  // Replace underscores and hyphens with spaces
  name = name.replace(/[_-]+/g, " ");

  // Remove multiple spaces and trim
  name = name.replace(/\s+/g, " ").trim();

  // Skip if too short or looks like garbage
  if (name.length < 2) return null;

  // Skip if it's just common words
  const skipWords = ["new", "old", "test", "temp", "file", "audio", "unknown"];
  if (skipWords.includes(name.toLowerCase())) return null;

  // Title case the name
  name = name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return name;
}

/**
 * Extract phone number from filename
 *
 * Supports formats:
 * - Superfone_9876543210_20260115.wav
 * - Call_+919876543210.wav
 * - 9876543210.wav
 * - Recording_91-98765-43210.wav
 */
export function extractPhoneFromFilename(filename: string): string | null {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");

  // Pattern 1: 10-digit Indian mobile number (starting with 6-9)
  const pattern10Digit = /(?:^|[^0-9])([6-9]\d{9})(?:[^0-9]|$)/;

  // Pattern 2: 12-digit with country code (91XXXXXXXXXX)
  const pattern12Digit = /(?:^|[^0-9])(91[6-9]\d{9})(?:[^0-9]|$)/;

  // Pattern 3: With + prefix (+91XXXXXXXXXX)
  const patternWithPlus = /\+?(91)?([6-9]\d{9})/;

  // Pattern 4: Hyphenated format (91-98765-43210 or 98765-43210)
  const patternHyphenated = /(?:\+?91[-\s]?)?([6-9]\d{4})[-\s]?(\d{5})/;

  // Try patterns in order of specificity
  let match = nameWithoutExt.match(pattern12Digit);
  if (match) return match[1];

  match = nameWithoutExt.match(pattern10Digit);
  if (match) return match[1];

  match = nameWithoutExt.match(patternWithPlus);
  if (match) return (match[1] || "") + match[2];

  match = nameWithoutExt.match(patternHyphenated);
  if (match) return match[1] + match[2];

  return null;
}

/**
 * Normalize phone number to 10-digit format
 *
 * Removes:
 * - Country code prefix (+91 or 91)
 * - Spaces, dashes, parentheses
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digits
  let digits = phone.replace(/\D/g, "");

  // Remove country code if present
  if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  }

  // If still more than 10 digits, try to extract the mobile number
  if (digits.length > 10) {
    // Find the 10-digit mobile pattern within
    const match = digits.match(/([6-9]\d{9})/);
    if (match) return match[1];
  }

  return digits;
}

// ============================================================================
// Lead Mapping
// ============================================================================

/**
 * Find the most recently updated lead matching a phone number
 */
export async function findMostRecentLead(phone: string): Promise<Lead | null> {
  // Try exact match first
  let { data: leads } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("contact", phone)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (leads && leads.length > 0) {
    return leads[0] as Lead;
  }

  // Try with country code prefix
  const phoneWith91 = `91${phone}`;
  ({ data: leads } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("contact", phoneWith91)
    .order("updated_at", { ascending: false })
    .limit(1));

  if (leads && leads.length > 0) {
    return leads[0] as Lead;
  }

  // Try with +91 prefix
  const phoneWithPlus = `+91${phone}`;
  ({ data: leads } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("contact", phoneWithPlus)
    .order("updated_at", { ascending: false })
    .limit(1));

  if (leads && leads.length > 0) {
    return leads[0] as Lead;
  }

  // Try partial match (last 10 digits)
  const last10 = phone.slice(-10);
  ({ data: leads } = await supabaseAdmin
    .from("leads")
    .select("*")
    .ilike("contact", `%${last10}`)
    .order("updated_at", { ascending: false })
    .limit(1));

  if (leads && leads.length > 0) {
    return leads[0] as Lead;
  }

  return null;
}

// ============================================================================
// Webhook Security
// ============================================================================

/**
 * Verify Telegram webhook authenticity
 *
 * Uses the secret_token parameter from setWebhook
 */
export function verifyTelegramWebhook(
  secretHeader: string | null,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) {
    // No secret configured, allow all
    return true;
  }
  return secretHeader === expectedSecret;
}

// ============================================================================
// Telegram API Helpers
// ============================================================================

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

/**
 * Set the Telegram webhook URL
 * Call this once when deploying the bot
 */
export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken?: string,
): Promise<{ ok: boolean; description?: string }> {
  const params: Record<string, string> = {
    url: webhookUrl,
    allowed_updates: JSON.stringify(["message"]),
    drop_pending_updates: "true",
  };

  if (secretToken) {
    params.secret_token = secretToken;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    return await response.json();
  } catch (error) {
    console.error("[Telegram] setWebhook error:", error);
    return {
      ok: false,
      description: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Get current webhook info
 */
export async function getTelegramWebhookInfo(
  botToken: string,
): Promise<{ ok: boolean; result?: Record<string, unknown> }> {
  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE}${botToken}/getWebhookInfo`,
    );
    return await response.json();
  } catch (error) {
    console.error("[Telegram] getWebhookInfo error:", error);
    return { ok: false };
  }
}

/**
 * Get file download URL from Telegram
 */
export async function getTelegramFileUrl(
  botToken: string,
  fileId: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });

    const data = await response.json();

    if (!data.ok || !data.result?.file_path) {
      console.error("[Telegram] getFile failed:", data);
      return null;
    }

    return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
  } catch (error) {
    console.error("[Telegram] getFile error:", error);
    return null;
  }
}

// ============================================================================
// Helper to setup webhook (for manual invocation)
// ============================================================================

/**
 * Setup webhook - call this function to configure the bot
 *
 * Example usage:
 *   await setupCallRecordingWebhook();
 */
export async function setupCallRecordingWebhook(): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`
    : undefined;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!botToken) {
    console.error("[Setup] Missing TELEGRAM_BOT_TOKEN");
    return;
  }

  if (!webhookUrl) {
    console.error("[Setup] Missing NEXT_PUBLIC_APP_URL");
    return;
  }

  console.warn(`[Setup] Setting webhook to: ${webhookUrl}`);

  const result = await setTelegramWebhook(botToken, webhookUrl, secretToken);

  if (result.ok) {
    console.warn("[Setup] Webhook configured successfully!");
  } else {
    console.error("[Setup] Failed to set webhook:", result.description);
  }
}
