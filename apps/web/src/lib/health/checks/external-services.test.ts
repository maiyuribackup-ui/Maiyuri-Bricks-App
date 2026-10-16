import { beforeEach, describe, expect, it, vi } from "vitest";

const responses: Array<Record<string, unknown>> = [];
const calls: Array<{ method: string; args: unknown[]; query: number }> = [];
let queryIndex = 0;

function builder(index: number) {
  const chain: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "in",
    "neq",
    "lt",
    "gte",
    "order",
    "limit",
    "single",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args, query: index });
      return chain;
    };
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(responses[index]).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => builder(queryIndex++),
  }),
}));

import { checkWorkerPipeline } from "./external-services";

beforeEach(() => {
  responses.length = 0;
  calls.length = 0;
  queryIndex = 0;
});

describe("checkWorkerPipeline", () => {
  it("matches worker eligibility and ignores unlinked placeholder recordings", async () => {
    responses.push(
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 29, error: null },
      { data: null, error: { code: "PGRST116" } },
    );

    const result = await checkWorkerPipeline();

    expect(result.status).toBe("healthy");
    expect(result.metadata).toMatchObject({
      actionableQueueCount: 0,
      recentFailureCount: 0,
      permanentFailureCount: 29,
      pendingCount: 0,
      failedCount: 0,
      metadataSchemaVersion: 2,
    });
    for (const query of [0, 1, 3]) {
      expect(calls).toContainEqual({
        method: "neq",
        args: ["phone_number", "PENDING"],
        query,
      });
    }
    expect(calls).toContainEqual({
      method: "lt",
      args: ["retry_count", 3],
      query: 1,
    });
  });
});
