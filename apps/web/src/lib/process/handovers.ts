/**
 * Formal handovers (PRD §11). Sales sends a package; the receiving role
 * accepts or returns it with a structured reason. The database owns the
 * state change; this layer adds the "accept = accept + complete the stage
 * when the checklist is done" convenience the My Work buttons need.
 */
import type { AuthenticatedUser } from "@/lib/api-helpers";
import type {
  AcceptHandoverInput,
  ProcessHandoverRow,
  ProcessInstanceView,
  RejectHandoverInput,
} from "@maiyuri/shared";
import { ProcessError } from "./errors";
import { advance, getInstanceView, type EngineOptions } from "./engine";
import { dispatchPendingEvents } from "./events";
import * as repo from "./repository";

async function after(instanceId: string, opts?: EngineOptions) {
  if (opts?.silent) return;
  try {
    await dispatchPendingEvents(instanceId);
  } catch (err) {
    console.error("[ProcessOS] event dispatch failed (ignored):", err);
  }
}

export async function createHandover(
  instanceId: string,
  actor: AuthenticatedUser,
  payload: Record<string, unknown>,
  toUserId?: string | null,
  opts?: EngineOptions,
): Promise<ProcessHandoverRow> {
  const row = await repo.rpc<ProcessHandoverRow>("process_handover_create", {
    p_instance_id: instanceId,
    p_actor: actor.id,
    p_to_user: toUserId ?? null,
    p_payload: payload,
  });
  await after(instanceId, opts);
  return row;
}

export interface AcceptResult {
  handover: ProcessHandoverRow;
  view: ProcessInstanceView;
  /** true when the stage was completed in the same call */
  advanced: boolean;
}

export async function acceptHandover(
  handoverId: string,
  actor: AuthenticatedUser,
  input: AcceptHandoverInput,
  opts?: EngineOptions,
): Promise<AcceptResult> {
  const handover = await repo.rpc<ProcessHandoverRow>(
    "process_handover_accept",
    {
      p_handover_id: handoverId,
      p_actor: actor.id,
      p_comment: input.comment ?? null,
    },
  );
  await after(handover.process_instance_id, opts);

  let advanced = false;
  let view = await getInstanceView(handover.process_instance_id, actor, opts);
  if (
    input.advance !== false &&
    view.current_stage_instance?.id === handover.stage_instance_id
  ) {
    const openRequired = view.tasks.filter(
      (t) => t.required && t.status === "open",
    );
    if (openRequired.length === 0) {
      view = await advance(
        handover.process_instance_id,
        actor,
        { expected_stage_instance_id: handover.stage_instance_id },
        opts,
      );
      advanced = true;
    }
  }
  return { handover, view, advanced };
}

export async function rejectHandover(
  handoverId: string,
  actor: AuthenticatedUser,
  input: RejectHandoverInput,
  opts?: EngineOptions,
): Promise<{ handover: ProcessHandoverRow; view: ProcessInstanceView }> {
  const result = await repo.rpc<{
    handover: ProcessHandoverRow;
    next_stage_instance_id: string;
  }>("process_handover_reject", {
    p_handover_id: handoverId,
    p_actor: actor.id,
    p_reason_code: input.reason_code,
    p_comment: input.comment,
    p_proposed_date: input.proposed_date ?? null,
    p_transition_key: null,
  });
  if (!result?.handover)
    throw new ProcessError(
      "PROCESS_ERROR",
      "Rejection did not return a handover",
      500,
    );
  await after(result.handover.process_instance_id, opts);
  const view = await getInstanceView(
    result.handover.process_instance_id,
    actor,
    opts,
  );
  return { handover: result.handover, view };
}
