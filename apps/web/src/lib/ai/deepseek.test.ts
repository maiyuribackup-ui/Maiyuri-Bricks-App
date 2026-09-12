import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isFallbackWorthy, deepseekComplete } from "./deepseek";

describe("isFallbackWorthy", () => {
  it("is true for quota / credit-depletion / 429 errors", () => {
    expect(isFallbackWorthy(new Error("[429 Too Many Requests] Your prepayment credits are depleted"))).toBe(true);
    expect(isFallbackWorthy("RESOURCE_EXHAUSTED")).toBe(true);
    expect(isFallbackWorthy(new Error("503 model overloaded"))).toBe(true);
    expect(isFallbackWorthy(new Error("fetch failed"))).toBe(true);
  });
  it("is false for ordinary non-transient errors", () => {
    expect(isFallbackWorthy(new Error("invalid argument: bad prompt"))).toBe(false);
    expect(isFallbackWorthy("")).toBe(false);
  });
});

describe("deepseekComplete", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.DEEPSEEK_API_KEY;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = realKey;
  });

  it("returns null when DEEPSEEK_API_KEY is missing (no-op, never throws)", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    expect(await deepseekComplete("hi")).toBeNull();
  });

  it("returns the assistant content on a successful response", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hello from deepseek" } }] }),
    }) as unknown as typeof fetch;
    expect(await deepseekComplete("hi")).toBe("hello from deepseek");
  });

  it("returns null (never throws) on a non-OK response or fetch error", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await deepseekComplete("hi")).toBeNull();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    expect(await deepseekComplete("hi")).toBeNull();
  });
});
