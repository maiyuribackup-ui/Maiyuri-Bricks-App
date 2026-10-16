import { describe, it, expect } from "vitest";
import { assertWithinBudget, FETCH_BUDGET_MS } from "./odoo-demand";

describe("demand sync fetch budget", () => {
  it("stays out of the way while there is time left", () => {
    expect(() => assertWithinBudget(Date.now() + 60_000, "sale.order")).not.toThrow();
  });

  it("gives up before the platform kills the function, naming the cause", () => {
    // The route allows 300s; the budget is 240s so the failure is OURS to
    // report — a run marked 'error' with a message beats a killed function
    // leaving its row stuck on 'running' (outage of 26-28 Aug).
    expect(FETCH_BUDGET_MS).toBeLessThan(300_000);
    expect(() => assertWithinBudget(Date.now() - 1, "sale.order.line")).toThrow(
      /budget of 240s exhausted while reading sale\.order\.line.*nothing was written/s,
    );
  });
});
