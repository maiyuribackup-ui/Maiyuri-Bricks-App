/**
 * Tests for resolveLeadRecipients — ensures lead pushes target the assigned
 * rep, and fall back to leadership for unassigned leads (e.g. Telegram voice
 * notes) so notifications are never silently dropped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIn = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ in: mockIn })) })),
  },
}));
// googleapis is imported by fcm.ts but unused in these tests — stub it out.
vi.mock("googleapis", () => ({ google: { auth: { JWT: class {} } } }));

import { resolveLeadRecipients, getUserIdsByRoles } from "./fcm";

beforeEach(() => vi.clearAllMocks());

describe("getUserIdsByRoles", () => {
  it("returns [] for an empty role list without a DB query", async () => {
    expect(await getUserIdsByRoles([])).toEqual([]);
    expect(mockIn).not.toHaveBeenCalled();
  });

  it("maps matched users to their ids", async () => {
    mockIn.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }] });
    expect(await getUserIdsByRoles(["founder", "owner"])).toEqual(["a", "b"]);
    expect(mockIn).toHaveBeenCalledWith("role", ["founder", "owner"]);
  });
});

describe("resolveLeadRecipients", () => {
  it("returns the assigned rep without a DB lookup", async () => {
    expect(await resolveLeadRecipients("rep-1")).toEqual(["rep-1"]);
    expect(mockIn).not.toHaveBeenCalled();
  });

  it("falls back to founders/owners when unassigned", async () => {
    mockIn.mockResolvedValue({ data: [{ id: "f1" }, { id: "o1" }] });
    expect(await resolveLeadRecipients(null)).toEqual(["f1", "o1"]);
    expect(mockIn).toHaveBeenCalledWith("role", ["founder", "owner"]);
  });

  it("returns an empty array when no leadership exists", async () => {
    mockIn.mockResolvedValue({ data: [] });
    expect(await resolveLeadRecipients(undefined)).toEqual([]);
  });
});
