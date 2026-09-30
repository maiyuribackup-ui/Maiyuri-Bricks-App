import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProcessEventRow } from "@maiyuri/shared";

let pending: ProcessEventRow[] = [];
const marked = new Set<string>();

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    from: () => {
      const chain: Record<string, unknown> = {};
      let mode: "select" | "update" = "select";
      let updatingId: string | null = null;
      for (const m of ["is", "order", "limit"]) chain[m] = () => chain;
      chain.select = () =>
        mode === "update"
          ? Promise.resolve({
              data:
                updatingId && !marked.has(updatingId)
                  ? (marked.add(updatingId), [{ id: updatingId }])
                  : [],
              error: null,
            })
          : chain;
      chain.eq = (_col: string, val: string) => {
        if (mode === "update") updatingId = val;
        return chain;
      };
      chain.update = () => {
        mode = "update";
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: pending.filter((e) => !marked.has(e.id)),
          error: null,
        }).then(resolve);
      return chain;
    },
  },
}));

import { dispatchPendingEvents } from "./events";

const ev = (id: string): ProcessEventRow => ({
  id,
  process_instance_id: "inst",
  stage_instance_id: null,
  event_type: "process.stage_started",
  actor_type: "user",
  actor_id: null,
  before_value: null,
  after_value: null,
  reason: null,
  payload: {},
  created_at: "",
});

beforeEach(() => {
  pending = [];
  marked.clear();
});

describe("dispatchPendingEvents", () => {
  it("notifies each pending event exactly once and calls the webhook", async () => {
    pending = [ev("a"), ev("b")];
    const notified: string[] = [];
    const hooks: string[] = [];
    const n1 = await dispatchPendingEvents("inst", {
      notify: async (e) => {
        notified.push(e.id);
      },
      webhook: async (e) => {
        hooks.push(e.id);
      },
    });
    expect(n1).toBe(2);
    expect(notified).toEqual(["a", "b"]);
    expect(hooks).toEqual(["a", "b"]);
    const n2 = await dispatchPendingEvents("inst", {
      notify: async (e) => {
        notified.push(e.id);
      },
      webhook: async () => {},
    });
    expect(n2).toBe(0);
    expect(notified).toEqual(["a", "b"]);
  });

  it("a failing notifier never blocks the others", async () => {
    pending = [ev("x"), ev("y")];
    const seen: string[] = [];
    const n = await dispatchPendingEvents("inst", {
      notify: async (e) => {
        seen.push(e.id);
        if (e.id === "x") throw new Error("push down");
      },
      webhook: async () => {},
    });
    expect(n).toBe(2);
    expect(seen).toEqual(["x", "y"]);
  });
});
