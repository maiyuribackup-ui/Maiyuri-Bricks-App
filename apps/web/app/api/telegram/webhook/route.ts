/**
 * Telegram Webhook Handler for Call Recording Intake
 *
 * Receives audio files from Telegram, extracts phone number from filename,
 * maps to lead, and queues for processing by Railway worker.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import {
  extractPhoneFromFilename,
  normalizePhoneNumber,
  findMostRecentLead,
  verifyTelegramWebhook,
  type TelegramUpdate,
} from '@/lib/telegram-webhook';

// Environment configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ALLOWED_CHAT_IDS = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map(Number) || [];

/**
 * POST /api/telegram/webhook
 * Receives updates from Telegram Bot API
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (TELEGRAM_WEBHOOK_SECRET && secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
      console.warn('[Telegram Webhook] Invalid secret token');
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update: TelegramUpdate = await request.json();
    console.log('[Telegram Webhook] Received update:', JSON.stringify(update, null, 2));

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

    // Check for audio content (voice, audio, or document)
    const audio = message.voice || message.audio ||
      (message.document?.mime_type?.startsWith('audio/') ? message.document : null);

    if (!audio) {
      // Silently ignore non-audio messages
      return NextResponse.json({ ok: true });
    }

    // Get filename for phone number extraction
    const filename = message.document?.file_name ||
      message.audio?.file_name ||
      `voice_${message.message_id}.ogg`;

    // Extract phone number from filename
    const extractedPhone = extractPhoneFromFilename(filename);

    if (!extractedPhone) {
      // Notify user about filename requirement
      await sendTelegramMessage(
        `❌ *Phone Number Not Found*\n\nCould not extract phone number from filename:\n\`${filename}\`\n\n` +
        `Please rename the file to include the phone number, e.g.:\n` +
        `• \`Superfone_9876543210_20260115.wav\`\n` +
        `• \`Call_+919876543210.wav\``,
        chatId.toString()
      );
      return NextResponse.json({ ok: true });
    }

    const normalizedPhone = normalizePhoneNumber(extractedPhone);

    // Check for duplicate (by telegram_file_id)
    const { data: existing } = await supabaseAdmin
      .from('call_recordings')
      .select('id')
      .eq('telegram_file_id', audio.file_id)
      .single();

    if (existing) {
      console.log(`[Telegram Webhook] Duplicate file: ${audio.file_id}`);
      await sendTelegramMessage(
        `⚠️ *Duplicate Recording*\n\nThis recording has already been uploaded.`,
        chatId.toString()
      );
      return NextResponse.json({ ok: true });
    }

    // Find the most recent lead matching this phone number
    const lead = await findMostRecentLead(normalizedPhone);

    // Insert call recording record with 'pending' status
    const { data: recording, error: insertError } = await supabaseAdmin
      .from('call_recordings')
      .insert({
        lead_id: lead?.id || null,
        phone_number: normalizedPhone,
        telegram_file_id: audio.file_id,
        telegram_message_id: message.message_id,
        telegram_chat_id: chatId,
        telegram_user_id: message.from?.id || null,
        original_filename: filename,
        file_size_bytes: audio.file_size || null,
        processing_status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Telegram Webhook] Insert error:', insertError);
      await sendTelegramMessage(
        `❌ *Upload Error*\n\nFailed to save recording. Please try again later.`,
        chatId.toString()
      );
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 });
    }

    // Send confirmation message
    const confirmMessage = lead
      ? `📞 *Call Recording Received*\n\n` +
        `👤 *Lead:* ${lead.name}\n` +
        `📱 *Phone:* ${normalizedPhone}\n` +
        `📁 *File:* ${filename}\n\n` +
        `⏳ Processing will begin shortly...`
      : `📞 *Call Recording Received*\n\n` +
        `📱 *Phone:* ${normalizedPhone}\n` +
        `📁 *File:* ${filename}\n\n` +
        `⚠️ No matching lead found - recording saved for manual mapping.\n\n` +
        `⏳ Processing will begin shortly...`;

    await sendTelegramMessage(confirmMessage, chatId.toString());

    console.log(`[Telegram Webhook] Recording queued: ${recording.id} for phone ${normalizedPhone}`);

    return NextResponse.json({ ok: true, recording_id: recording.id });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
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
    webhook: 'telegram-call-recording',
    configured: Boolean(TELEGRAM_BOT_TOKEN),
    allowed_chats: ALLOWED_CHAT_IDS.length,
  });
}
