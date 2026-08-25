import { describe, it, expect } from "vitest";
import { interpretPushTest } from "./test-result";

describe("interpretPushTest", () => {
  it("reports a server-not-configured state", () => {
    expect(interpretPushTest({ configured: false })).toEqual({
      state: "error",
      message: "Push is not configured on the server yet.",
    });
  });

  it("reports success when at least one device received the push", () => {
    const out = interpretPushTest({ configured: true, sent: 2, failed: 0 });
    expect(out.state).toBe("sent");
    expect(out.message).toContain("2 device");
  });

  it("distinguishes delivery failures from missing registrations", () => {
    const out = interpretPushTest({ configured: true, sent: 0, failed: 3 });
    expect(out.state).toBe("error");
    expect(out.message).toContain("delivery failed");
    expect(out.message).toContain("3 device");
  });

  it("reports no registered devices when configured but nothing was sent or failed", () => {
    const out = interpretPushTest({ configured: true, sent: 0, failed: 0 });
    expect(out.state).toBe("error");
    expect(out.message).toContain("No devices registered");
  });

  it("treats missing counts as zero", () => {
    expect(interpretPushTest({ configured: true }).message).toContain(
      "No devices registered",
    );
  });
});
