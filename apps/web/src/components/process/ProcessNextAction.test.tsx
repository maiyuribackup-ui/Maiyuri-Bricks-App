import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ProcessInstanceView } from "@maiyuri/shared";
import { ProcessNextAction } from "./ProcessNextAction";
import { ProcessProgressTrack } from "./ProcessProgressTrack";

function view(over: Partial<ProcessInstanceView> = {}): ProcessInstanceView {
  return {
    instance: { id: "i", status: "active", cancel_reason: null } as never,
    definition: {
      id: "d",
      process_key: "P",
      name: "Lead to Delivery",
      category: "SALES",
    },
    version: { id: "v", version: "1.1" },
    current_stage: {
      id: "s2",
      name: "Quotation",
      stage_type: "ACTION",
      owner_role: "SALES_ENGINEER",
    } as never,
    current_stage_instance: {
      due_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      blocked_reason: null,
      assigned_user_id: "u1",
    } as never,
    tasks: [
      {
        id: "t1",
        title: "Create the quotation in Odoo",
        sequence: 1,
        required: true,
        status: "open",
        evidence_required: false,
      } as never,
    ],
    gates: [],
    handover: null,
    evidence: [],
    journey: [
      {
        stage_id: "s1",
        stage_key: "A",
        name: "New Lead",
        sequence: 1,
        owner_role: "SALES_ENGINEER",
        stage_type: "ACTION",
        status: "completed",
        stage_instance_id: null,
        due_at: null,
      },
      {
        stage_id: "s2",
        stage_key: "B",
        name: "Quotation",
        sequence: 2,
        owner_role: "SALES_ENGINEER",
        stage_type: "ACTION",
        status: "current",
        stage_instance_id: "si",
        due_at: null,
      },
      {
        stage_id: "s3",
        stage_key: "C",
        name: "Advance",
        sequence: 3,
        owner_role: "FINANCE",
        stage_type: "ACTION",
        status: "upcoming",
        stage_instance_id: null,
        due_at: null,
      },
      {
        stage_id: "s4",
        stage_key: "D",
        name: "Done",
        sequence: 4,
        owner_role: "SALES_ENGINEER",
        stage_type: "END",
        status: "upcoming",
        stage_instance_id: null,
        due_at: null,
      },
    ],
    available_transitions: [],
    can_act: true,
    ...over,
  };
}

describe("ProcessNextAction", () => {
  it("leads with the next checklist item, the owner and the overdue time", () => {
    const onGo = vi.fn();
    render(
      <ProcessNextAction view={view()} assigneeName="Srinivasan" onGo={onGo} />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Create the quotation in Odoo",
    );
    expect(screen.getByText("Srinivasan")).toBeInTheDocument();
    expect(screen.getByText(/Overdue by 2 h/)).toBeInTheDocument();
    expect(screen.getByText(/Stage 2 of 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Do it now/ }));
    expect(onGo).toHaveBeenCalled();
  });

  it("turns rose and names the exception when blocked", () => {
    render(
      <ProcessNextAction
        view={view({
          instance: { id: "i", status: "blocked" } as never,
          current_stage_instance: {
            blocked_reason: { code: "X", message: "Customer not reachable" },
          } as never,
        })}
      />,
    );
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Customer not reachable")).toBeInTheDocument();
  });

  it("hides the action button once the case is done", () => {
    render(
      <ProcessNextAction
        view={view({ instance: { id: "i", status: "completed" } as never })}
        onGo={() => {}}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("This case is complete")).toBeInTheDocument();
  });
});

describe("ProcessProgressTrack", () => {
  it("renders one segment per stage, marks the current one and drops unreached END stages", () => {
    render(<ProcessProgressTrack steps={view().journey} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).toHaveAttribute("data-status", "completed");
    expect(screen.getByText("Advance")).toBeInTheDocument();
  });
});
