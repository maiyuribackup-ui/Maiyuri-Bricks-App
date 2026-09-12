import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  ProcessInstanceView,
  ProcessStageView,
  ProcessTaskRow,
} from "@maiyuri/shared";
import { useAuthStore } from "@/stores/authStore";
import { ProcessStagePanel } from "./ProcessStagePanel";

// The panel talks to the API only through these hooks; stub them so the
// component tests stay pure (no QueryClient, no fetch).
const mutation = () => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
});
vi.mock("@/hooks/useProcess", () => ({
  useCompleteProcessTask: () => mutation(),
  useAdvanceProcess: () => mutation(),
  useBlockProcess: () => mutation(),
  useUnblockProcess: () => mutation(),
  useOverrideGate: () => mutation(),
  useAcceptHandover: () => mutation(),
  useRejectHandover: () => mutation(),
  useAddProcessEvidence: () => mutation(),
}));

const ME = "11111111-1111-4111-8111-111111111111";
const SENDER = "22222222-2222-4222-8222-222222222222";

function stage(overrides: Partial<ProcessStageView> = {}): ProcessStageView {
  return {
    id: "stage-1",
    process_version_id: "v1",
    stage_key: "FACTORY_HANDOVER",
    name: "Factory Handover",
    description: null,
    stage_type: "ACTION",
    sequence: 5,
    owner_role: "FACTORY_MANAGER",
    sla_minutes: 240,
    is_start: false,
    configuration: {},
    checklist: [],
    gates: [],
    transitions: [],
    ...overrides,
  };
}

function task(id: string, title: string, required = true): ProcessTaskRow {
  return {
    id,
    stage_instance_id: "si-1",
    checklist_item_id: null,
    item_key: id.toUpperCase(),
    title,
    description: null,
    status: "open",
    required,
    evidence_required: false,
    sequence: 1,
    assigned_user_id: null,
    completed_at: null,
    completed_by: null,
    note: null,
    metadata: {},
    created_at: "2026-09-12T09:00:00Z",
    updated_at: "2026-09-12T09:00:00Z",
  };
}

function view(
  overrides: Partial<ProcessInstanceView> = {},
): ProcessInstanceView {
  const current = overrides.current_stage ?? stage();
  return {
    instance: {
      id: "inst-1",
      process_definition_id: "def-1",
      process_version_id: "v1",
      entity_type: "lead",
      entity_id: "lead-1",
      status: "active",
      current_stage_id: current.id,
      current_stage_instance_id: "si-1",
      context: {
        customer_name: "Kumar",
        product_name: "8-inch Earth Interlock",
        quantity: 18500,
      },
      imported_existing_case: false,
      import_source: null,
      imported_at: null,
      lock_version: 1,
      started_at: "2026-09-12T09:00:00Z",
      completed_at: null,
      cancelled_at: null,
      cancel_reason: null,
      created_by: null,
      created_at: "2026-09-12T09:00:00Z",
      updated_at: "2026-09-12T09:00:00Z",
    },
    definition: {
      id: "def-1",
      process_key: "LEAD_TO_DELIVERY",
      name: "Lead to Delivery",
      category: "SALES",
    },
    version: { id: "v1", version: "1.0" },
    current_stage: current,
    current_stage_instance: {
      id: "si-1",
      process_instance_id: "inst-1",
      process_stage_id: current.id,
      status: "current",
      assigned_role: "FACTORY_MANAGER",
      assigned_user_id: ME,
      work_item_id: null,
      started_at: "2026-09-12T09:00:00Z",
      due_at: null,
      sla_warned_at: null,
      sla_breached_at: null,
      completed_at: null,
      completed_by: null,
      blocked_reason: null,
      linked_record: null,
      outcome: null,
      outcome_reason: null,
      created_at: "2026-09-12T09:00:00Z",
      updated_at: "2026-09-12T09:00:00Z",
    },
    tasks: [task("t1", "Check available stock")],
    gates: [],
    handover: null,
    evidence: [],
    journey: [],
    available_transitions: [],
    can_act: true,
    ...overrides,
  };
}

describe("ProcessStagePanel", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: ME,
        email: "rajesh@example.com",
        name: "Rajesh",
        role: "production_supervisor",
        language_preference: "en",
        created_at: "2026-01-01T00:00:00Z",
      },
      isAuthenticated: true,
    });
  });

  it("renders case context and the checklist", () => {
    render(<ProcessStagePanel view={view()} />);
    expect(screen.getByText("Kumar")).toBeInTheDocument();
    expect(screen.getByText("18,500")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Check available stock" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Complete stage/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Raise exception/ }),
    ).toBeEnabled();
  });

  it("disables every action when the caller cannot act", () => {
    render(<ProcessStagePanel view={view({ can_act: false })} />);
    expect(
      screen.getByRole("button", { name: /Complete stage/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Raise exception/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Check available stock" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/You can follow it here but not act on it/),
    ).toBeInTheDocument();
  });

  it("offers Accept / Return for a pending handover addressed to me", () => {
    const v = view({
      current_stage: stage({ stage_type: "HANDOVER" }),
      handover: {
        id: "h-1",
        process_instance_id: "inst-1",
        stage_instance_id: "si-1",
        from_role: "SALES_ENGINEER",
        from_user_id: SENDER,
        to_role: "FACTORY_MANAGER",
        to_user_id: ME,
        status: "PENDING",
        payload: { customer_name: "Kumar", quantity: 18500 },
        requested_at: "2026-09-12T09:00:00Z",
        accepted_at: null,
        rejected_at: null,
        rejection_reason_code: null,
        rejection_comment: null,
        proposed_date: null,
        acted_by: null,
        created_at: "2026-09-12T09:00:00Z",
        updated_at: "2026-09-12T09:00:00Z",
      },
    });
    render(<ProcessStagePanel view={v} />);
    expect(
      screen.getByRole("button", { name: /Accept Handover/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Return with exception/ }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Complete stage/ }),
    ).not.toBeInTheDocument();
    // The receiver sees the package the sender wrote.
    expect(screen.getByText("Handover package")).toBeInTheDocument();
  });

  it("shows the outcome picker for DECISION stages and asks for a reason when required", () => {
    const v = view({
      current_stage: stage({
        stage_type: "DECISION",
        name: "Advance decision",
        configuration: {
          outcomes: ["APPROVED", "REVISE_QUOTE", "LOST"],
          outcomes_requiring_reason: ["LOST"],
        },
      }),
    });
    render(<ProcessStagePanel view={v} />);
    const group = screen.getByRole("radiogroup", { name: "Outcome" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(
      screen.queryByLabelText(/Reason \(required\)/),
    ).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole("radio", { name: "Lost" }));
    expect(screen.getByLabelText(/Reason \(required\)/)).toBeInTheDocument();
  });

  it("shows the blocked reason and a Clear exception button", () => {
    const base = view();
    const v: ProcessInstanceView = {
      ...base,
      instance: { ...base.instance, status: "blocked" },
      current_stage_instance: {
        ...base.current_stage_instance!,
        status: "blocked",
        blocked_reason: { code: "STOCK", message: "Only 6,000 in stock" },
      },
    };
    render(<ProcessStagePanel view={v} />);
    expect(screen.getByText("Only 6,000 in stock")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear exception" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Complete stage/ }),
    ).not.toBeInTheDocument();
  });
});
