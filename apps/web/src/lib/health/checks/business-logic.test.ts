import { beforeEach, describe, expect, it, vi } from "vitest";

const results: Array<{ count: number | null; error: Error | null }> = [];
const calls: Array<{ method: string; args: unknown[]; query: number }> = [];
let queryIndex = 0;

function builder(index: number) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "lt", "or"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args, query: index });
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(results[index]).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => builder(queryIndex++),
  }),
}));

import { checkStaleLeads } from "./business-logic";

beforeEach(() => {
  results.length = 0;
  calls.length = 0;
  queryIndex = 0;
});

describe("checkStaleLeads", () => {
  it("counts only unique active open leads while retaining category detail", async () => {
    results.push(
      { count: 13, error: null },
      { count: 63, error: null },
      { count: 67, error: null },
    );

    const result = await checkStaleLeads();

    expect(result.metadata).toMatchObject({
      hot_stale: 13,
      followup_stale: 63,
      total_stale: 67,
      category_overlap: 9,
    });
    for (const index of [0, 1, 2]) {
      expect(calls).toContainEqual({
        method: "eq",
        args: ["is_archived", false],
        query: index,
      });
      expect(calls).toContainEqual({
        method: "not",
        args: ["pipeline_stage", "in", "(order_won,closed_lost)"],
        query: index,
      });
    }
    expect(calls.some((call) => call.query === 2 && call.method === "or")).toBe(
      true,
    );
  });
});
