import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProcessJourneyStep } from "@maiyuri/shared";
import { ProcessJourney, condenseJourney } from "./ProcessJourney";

function step(
  seq: number,
  name: string,
  status: ProcessJourneyStep["status"],
): ProcessJourneyStep {
  return {
    stage_id: `stage-${seq}`,
    stage_key: name.toUpperCase().replace(/\s+/g, "_"),
    name,
    sequence: seq,
    owner_role: "SALES_ENGINEER",
    stage_type: "ACTION",
    status,
    stage_instance_id: status === "upcoming" ? null : `si-${seq}`,
    due_at: null,
  };
}

const STEPS: ProcessJourneyStep[] = [
  step(1, "New Lead", "completed"),
  step(2, "Qualified", "completed"),
  step(3, "Factory Handover", "current"),
  step(4, "Production", "upcoming"),
  step(5, "Delivered", "upcoming"),
];

describe("ProcessJourney", () => {
  it("renders one glyph per status (✓ ● ○)", () => {
    render(<ProcessJourney steps={STEPS} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain("✓");
    expect(items[2].textContent).toContain("●");
    expect(items[3].textContent).toContain("○");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Factory Handover")).toBeInTheDocument();
  });

  it("marks blocked and failed stages with !", () => {
    render(
      <ProcessJourney
        steps={[
          step(1, "Quote", "completed"),
          step(2, "Advance", "blocked"),
          step(3, "Handover", "failed"),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[1].textContent).toContain("!");
    expect(items[1]).toHaveAttribute("data-status", "blocked");
    expect(items[2].textContent).toContain("!");
  });

  it("condensed mode shows previous / current / next only", () => {
    render(<ProcessJourney steps={STEPS} condensed />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.getAttribute("data-status"))).toEqual([
      "completed",
      "current",
      "upcoming",
    ]);
    expect(screen.queryByText("New Lead")).not.toBeInTheDocument();
  });

  it("condenseJourney falls back to the tail when no stage is live", () => {
    const done = STEPS.map((s) => ({ ...s, status: "completed" as const }));
    expect(condenseJourney(done).map((s) => s.sequence)).toEqual([3, 4, 5]);
  });

  it("wraps the strip in a link when href is given", () => {
    render(<ProcessJourney steps={STEPS} href="/processes/instances/abc" />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/processes/instances/abc",
    );
  });
});
