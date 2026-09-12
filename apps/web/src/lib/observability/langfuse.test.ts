import { describe, expect, it, vi, beforeEach } from "vitest";

import { sanitizeForLangfuse, traceAiGeneration } from "./langfuse";

describe("Langfuse observability safety", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("masks phone numbers and secret-like keys recursively", () => {
    const sanitized = sanitizeForLangfuse({
      customer: "+91 98421 11157 Ram",
      nested: { apiKey: "dummy-api-key-value", transcript: "call 9842111157 now" },
      list: ["79049 94883", { password: "hidden" }],
    });

    const asText = JSON.stringify(sanitized);
    expect(asText).not.toContain("98421 11157");
    expect(asText).not.toContain("9842111157");
    expect(asText).not.toContain("79049 94883");
    expect(asText).not.toContain("dummy-api-key-value");
    expect(asText).not.toContain("hidden");
    expect(asText).toContain("[masked-phone]");
    expect(asText).toContain("[redacted]");
  });

  it("does not initialize Langfuse when explicitly disabled", async () => {
    vi.stubEnv("LANGFUSE_ENABLED", "false");
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-test");

    const run = vi.fn(async () => ({ output: "ok", value: "ok" }));
    await expect(
      traceAiGeneration({
        name: "test.disabled",
        model: "test-model",
        input: { phone: "+91 98421 11157" },
        run,
      }),
    ).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
