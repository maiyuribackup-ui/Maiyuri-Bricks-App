/**
 * Telegram Webhook Setup & Diagnostics
 *
 * GET /api/telegram/setup - Check webhook status
 * POST /api/telegram/setup - Register webhook with Telegram
 *
 * Use this endpoint to diagnose and fix webhook issues.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  setTelegramWebhook,
  getTelegramWebhookInfo,
} from "@/lib/telegram-webhook";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const ALLOWED_CHAT_IDS =
  process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(",").map(Number) || [];

/**
 * GET /api/telegram/setup
 * Returns current webhook status and configuration diagnostics
 */
export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: {
      bot_token_set: Boolean(TELEGRAM_BOT_TOKEN),
      bot_token_preview: TELEGRAM_BOT_TOKEN
        ? `${TELEGRAM_BOT_TOKEN.slice(0, 10)}...`
        : null,
      app_url: APP_URL ?? "NOT SET",
      webhook_secret_set: Boolean(TELEGRAM_WEBHOOK_SECRET),
      allowed_chat_ids:
        ALLOWED_CHAT_IDS.length > 0 ? ALLOWED_CHAT_IDS : "ALL (no restriction)",
    },
    expected_webhook_url: APP_URL ? `${APP_URL}/api/telegram/webhook` : null,
  };

  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({
      ...diagnostics,
      status: "error",
      error: "TELEGRAM_BOT_TOKEN is not set",
      fix: "Add TELEGRAM_BOT_TOKEN to your environment variables",
    });
  }

  // Get current webhook info from Telegram
  try {
    const webhookInfo = await getTelegramWebhookInfo(TELEGRAM_BOT_TOKEN);

    if (!webhookInfo.ok) {
      return NextResponse.json({
        ...diagnostics,
        status: "error",
        error: "Failed to get webhook info from Telegram",
        telegram_response: webhookInfo,
      });
    }

    const result = webhookInfo.result as Record<string, unknown>;
    const currentUrl = result.url as string;
    const expectedUrl = `${APP_URL}/api/telegram/webhook`;
    const isCorrectUrl = currentUrl === expectedUrl;

    return NextResponse.json({
      ...diagnostics,
      status: isCorrectUrl ? "ok" : "warning",
      webhook_info: {
        url: currentUrl || "NOT SET",
        url_matches_expected: isCorrectUrl,
        has_custom_certificate: result.has_custom_certificate,
        pending_update_count: result.pending_update_count,
        last_error_date: result.last_error_date
          ? new Date((result.last_error_date as number) * 1000).toISOString()
          : null,
        last_error_message: result.last_error_message ?? null,
        max_connections: result.max_connections,
        allowed_updates: result.allowed_updates,
      },
      fix: !isCorrectUrl
        ? "POST to this endpoint to register the correct webhook URL"
        : null,
    });
  } catch (error) {
    return NextResponse.json({
      ...diagnostics,
      status: "error",
      error: "Failed to connect to Telegram API",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * POST /api/telegram/setup
 * Registers the webhook with Telegram
 */
export async function POST(request: NextRequest) {
  // Optional: Allow custom URL for testing
  let webhookUrl: string;
  try {
    const body = await request.json().catch(() => ({}));
    webhookUrl = body.webhook_url || `${APP_URL}/api/telegram/webhook`;
  } catch {
    webhookUrl = `${APP_URL}/api/telegram/webhook`;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      {
        status: "error",
        error: "TELEGRAM_BOT_TOKEN is not set",
      },
      { status: 500 },
    );
  }

  if (!webhookUrl || webhookUrl.includes("undefined")) {
    return NextResponse.json(
      {
        status: "error",
        error: "NEXT_PUBLIC_APP_URL is not set",
      },
      { status: 500 },
    );
  }

  console.warn(`[Telegram Setup] Registering webhook: ${webhookUrl}`);

  const result = await setTelegramWebhook(
    TELEGRAM_BOT_TOKEN,
    webhookUrl,
    TELEGRAM_WEBHOOK_SECRET,
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to register webhook",
        telegram_response: result,
      },
      { status: 500 },
    );
  }

  // Verify the webhook was set correctly
  const verifyInfo = await getTelegramWebhookInfo(TELEGRAM_BOT_TOKEN);

  return NextResponse.json({
    status: "success",
    message: "Webhook registered successfully",
    webhook_url: webhookUrl,
    telegram_response: result,
    verification: verifyInfo.result,
  });
}
