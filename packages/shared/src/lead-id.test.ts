import { describe, expect, it } from "vitest";
import { isLeadId, leadPathFromUrl, safeNotificationPath } from "./lead-id";

const UUID = "9d57a341-7ede-4082-b47e-7e42cafbcfaf";

describe("lead identifiers", () => {
  it("accepts canonical UUID lead IDs only", () => {
    expect(isLeadId(UUID)).toBe(true);
    expect(isLeadId("undefined")).toBe(false);
    expect(isLeadId("123")).toBe(false);
    expect(isLeadId("")).toBe(false);
  });

  it("accepts only canonical lead-detail notification paths", () => {
    expect(leadPathFromUrl(`/leads/${UUID}`)).toBe(`/leads/${UUID}`);
    expect(leadPathFromUrl("/leads/undefined")).toBeNull();
    expect(leadPathFromUrl(`/leads/${UUID}/edit`)).toBeNull();
    expect(leadPathFromUrl(`https://evil.example/leads/${UUID}`)).toBeNull();
  });

  it("preserves supported app paths", () => {
    expect(safeNotificationPath("/dashboard")).toBe("/dashboard");
    expect(safeNotificationPath("/onehub/my-work")).toBe("/onehub/my-work");
    expect(safeNotificationPath("/onehub/expenses")).toBe("/onehub/expenses");
    expect(safeNotificationPath(`/leads/${UUID}`)).toBe(`/leads/${UUID}`);
    expect(safeNotificationPath(`/onehub/my-work/${UUID}`)).toBe(
      `/onehub/my-work/${UUID}`,
    );
  });

  it("rejects malformed, external, traversal, and unknown paths", () => {
    expect(safeNotificationPath("/leads/undefined")).toBeNull();
    expect(safeNotificationPath("https://evil.example/dashboard")).toBeNull();
    expect(safeNotificationPath("//evil.example/dashboard")).toBeNull();
    expect(safeNotificationPath("/../dashboard")).toBeNull();
    expect(safeNotificationPath("/%2e%2e/dashboard")).toBeNull();
    expect(safeNotificationPath("/dashboard?next=/leads")).toBeNull();
    expect(safeNotificationPath("/dashboard#fragment")).toBeNull();
    expect(safeNotificationPath("/unknown")).toBeNull();
  });
});
