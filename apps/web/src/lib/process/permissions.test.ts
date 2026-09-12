import { describe, it, expect } from "vitest";
import {
  canActOnStage,
  canCancelInstance,
  canManageDefinitions,
  processRolesFor,
  userHasProcessRole,
} from "./permissions";
import { processErrorFromMessage } from "./errors";

describe("process roles", () => {
  it("maps app roles onto process roles; partners hold every role", () => {
    expect(userHasProcessRole("sales", "SALES_ENGINEER")).toBe(true);
    expect(userHasProcessRole("engineer", "SALES_ENGINEER")).toBe(true);
    expect(userHasProcessRole("production_supervisor", "FACTORY_MANAGER")).toBe(
      true,
    );
    expect(userHasProcessRole("accountant", "FINANCE")).toBe(true);
    expect(userHasProcessRole("sales", "FINANCE")).toBe(false);
    expect(userHasProcessRole("sales", "FACTORY_MANAGER")).toBe(false);
    expect(userHasProcessRole("founder", "FINANCE")).toBe(true);
    expect(userHasProcessRole("owner", "FACTORY_MANAGER")).toBe(true);
    expect(userHasProcessRole(null, "SALES_ENGINEER")).toBe(false);
    expect(processRolesFor("driver")).toEqual([]);
    expect(processRolesFor("founder")).toHaveLength(4);
  });

  it("assignee may always act; otherwise the stage role decides", () => {
    const stage = {
      assigned_role: "FACTORY_MANAGER" as const,
      assigned_user_id: "rajesh",
    };
    expect(canActOnStage({ id: "rajesh", role: "driver" }, stage)).toBe(true);
    expect(
      canActOnStage({ id: "other", role: "production_supervisor" }, stage),
    ).toBe(true);
    expect(canActOnStage({ id: "srini", role: "sales" }, stage)).toBe(false);
    expect(canActOnStage({ id: "ram", role: "founder" }, stage)).toBe(true);
  });

  it("lead-scoped sales stages follow the sales-access rule", () => {
    const stage = {
      assigned_role: "SALES_ENGINEER" as const,
      assigned_user_id: null,
    };
    const lead = { assigned_staff: "srini", created_by: "srini" };
    expect(canActOnStage({ id: "srini", role: "sales" }, stage, lead)).toBe(
      true,
    );
    expect(canActOnStage({ id: "someone", role: "sales" }, stage, lead)).toBe(
      true,
    ); // sales has full access
    expect(canActOnStage({ id: "acc", role: "accountant" }, stage, lead)).toBe(
      false,
    );
  });

  it("definition management and cancellation are partner-gated", () => {
    expect(canManageDefinitions("founder")).toBe(true);
    expect(canManageDefinitions("sales")).toBe(false);
    expect(
      canCancelInstance({ id: "u", role: "sales" }, { created_by: "u" }),
    ).toBe(true);
    expect(
      canCancelInstance({ id: "u", role: "sales" }, { created_by: "v" }),
    ).toBe(false);
    expect(
      canCancelInstance({ id: "u", role: "owner" }, { created_by: "v" }),
    ).toBe(true);
  });
});

describe("processErrorFromMessage", () => {
  it("maps raised codes to statuses and extracts gate keys", () => {
    expect(
      processErrorFromMessage("FORBIDDEN: only the FINANCE may complete")
        .status,
    ).toBe(403);
    expect(processErrorFromMessage("STALE_STAGE: moved").status).toBe(409);
    const gate = processErrorFromMessage(
      "GATE_FAILED:ADV: Advance not verified",
    );
    expect(gate.code).toBe("GATE_FAILED");
    expect(gate.gateKey).toBe("ADV");
    expect(gate.status).toBe(422);
    expect(gate.message).toBe("Advance not verified");
    expect(processErrorFromMessage("something else").status).toBe(500);
  });
});
