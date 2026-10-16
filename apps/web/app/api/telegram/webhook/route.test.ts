import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: mocks.sendTelegramMessage,
}));

vi.mock("@/lib/golden-hour", () => ({
  createFirstResponseTask: vi.fn(),
}));

vi.mock("@/lib/telegram-webhook", () => ({
  extractFromFilename: () => ({ phone: "9876543210", name: "Test Customer" }),
  normalizePhoneNumber: (phone: string) => phone,
  findMostRecentLead: vi.fn(),
}));

import { POST } from "./route";

function recordingRequest(chatId: number): NextRequest {
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 2,
        chat: { id: chatId, type: "group", title: "Test" },
        document: {
          file_id: "file-1",
          file_name: "Test_9876543210.wav",
          mime_type: "audio/wav",
        },
      },
    }),
  });
}

describe("Telegram recording outage response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: null,
            error: { code: "exceed_egress_quota" },
          }),
        }),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a returned Telegram delivery failure and still acknowledges the update", async () => {
    mocks.sendTelegramMessage.mockResolvedValue({
      success: false,
      error: "Telegram API unavailable",
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(recordingRequest(-5116644495));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      temporary_outage: true,
    });
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[Telegram Webhook] Failed to send temporary outage notice",
    );
  });

  it("does not notify or query Supabase for an unauthorized chat", async () => {
    const response = await POST(recordingRequest(-999));

    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
  });
});
