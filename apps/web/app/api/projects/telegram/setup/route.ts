export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.PROJECTS_TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.PROJECTS_TELEGRAM_WEBHOOK_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// GET — show current webhook config
export async function GET() {
  if (!BOT_TOKEN) {
    return NextResponse.json({ configured: false, reason: "PROJECTS_TELEGRAM_BOT_TOKEN not set" });
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const info = await res.json();
    return NextResponse.json({
      configured: true,
      expected_webhook_url: APP_URL ? `${APP_URL}/api/projects/telegram/webhook` : null,
      current: info.result ?? info,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

// POST — register the webhook with Telegram. Authorize with the webhook secret
// (Bearer) so only someone holding it can (re)register.
export async function POST(request: NextRequest) {
  if (!BOT_TOKEN || !WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Projects bot env not set" }, { status: 400 });
  }
  if (!APP_URL) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 400 });
  }
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const webhookUrl = `${APP_URL}/api/projects/telegram/webhook`;
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["message"],
      }),
    });
    const result = await res.json();
    return NextResponse.json({ webhook_url: webhookUrl, telegram: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
