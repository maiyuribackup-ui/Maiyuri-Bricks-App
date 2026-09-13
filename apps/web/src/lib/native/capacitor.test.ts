/**
 * Tests for the native push bridge — the core reliability logic of the push
 * fix: Bearer-authenticated token registration with retry, single-bind
 * listeners, and foreground toast handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetSession, mockAddToast } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockAddToast: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: mockGetSession } }),
}));
vi.mock("@/stores/uiStore", () => ({
  useUIStore: { getState: () => ({ addToast: mockAddToast }) },
}));

type Listeners = Record<string, ((arg: unknown) => void)[]>;

function installBridge(opts: { granted?: boolean } = {}) {
  const listeners: Listeners = {};
  const Push = {
    addListener: vi.fn((evt: string, cb: (arg: unknown) => void) => {
      (listeners[evt] ||= []).push(cb);
    }),
    requestPermissions: vi.fn(async () => ({
      receive: opts.granted === false ? "denied" : "granted",
    })),
    register: vi.fn(async () => {}),
    createChannel: vi.fn(async () => {}),
  };
  (window as unknown as { Capacitor: unknown }).Capacitor = {
    isNativePlatform: () => true,
    Plugins: { PushNotifications: Push },
  };
  return { Push, listeners };
}

async function load() {
  // Fresh module each time so the module-level `listenersBound` resets.
  vi.resetModules();
  return import("./capacitor");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "jwt-123" } },
  });
  (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

describe("initPushNotifications", () => {
  it("no-ops when not running in the native app", async () => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    const { initPushNotifications } = await load();
    await initPushNotifications();
    expect(global.fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("requests permission, creates the channel, and registers", async () => {
    const { Push } = installBridge();
    const { initPushNotifications } = await load();
    await initPushNotifications();
    expect(Push.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "default", importance: 5 }),
    );
    expect(Push.requestPermissions).toHaveBeenCalled();
    expect(Push.register).toHaveBeenCalled();
  });

  it("does not register when permission is denied", async () => {
    const { Push } = installBridge({ granted: false });
    const { initPushNotifications } = await load();
    await initPushNotifications();
    expect(Push.register).not.toHaveBeenCalled();
  });

  it("binds each listener only once across repeated init calls", async () => {
    const { Push } = installBridge();
    const { initPushNotifications } = await load();
    await initPushNotifications();
    await initPushNotifications();
    const registrationBinds = Push.addListener.mock.calls.filter(
      (c) => c[0] === "registration",
    );
    expect(registrationBinds).toHaveLength(1);
  });

  it("POSTs the token with a Bearer header on the registration event", async () => {
    const { listeners } = installBridge();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const { initPushNotifications } = await load();
    await initPushNotifications();

    await listeners["registration"][0]({ value: "device-tok" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/push/register",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer jwt-123" }),
      }),
    );
    expect(localStorage.getItem("mb.push.registeredToken")).toBe("device-tok");
  });

  it("retries with backoff when registration fails, then succeeds", async () => {
    vi.useFakeTimers();
    const { listeners } = installBridge();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true });
    const { initPushNotifications } = await load();
    await initPushNotifications();

    const done = listeners["registration"][0]({ value: "device-tok" });
    await vi.runAllTimersAsync();
    await done;

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      2,
    );
    expect(localStorage.getItem("mb.push.registeredToken")).toBe("device-tok");
  });

  it("shows an in-app toast for a foreground push", async () => {
    const { listeners } = installBridge();
    const { initPushNotifications } = await load();
    await initPushNotifications();

    listeners["pushNotificationReceived"][0]({
      title: "Hot lead",
      body: "Follow up now",
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Hot lead", message: "Follow up now" }),
    );
  });
});
