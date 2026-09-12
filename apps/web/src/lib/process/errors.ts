/**
 * Process OS errors. The plpgsql engine raises `CODE: message`; this maps
 * every code to an HTTP status so routes stay one-liners.
 */

export const PROCESS_ERROR_STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  PROCESS_NOT_FOUND: 404,
  INSTANCE_NOT_FOUND: 404,
  TASK_NOT_FOUND: 404,
  HANDOVER_NOT_FOUND: 404,
  VERSION_NOT_FOUND: 404,
  STAGE_NOT_FOUND: 404,
  START_STAGE_NOT_FOUND: 404,
  GATE_NOT_FOUND: 404,
  TRANSITION_NOT_FOUND: 404,
  NO_ACTIVE_VERSION: 409,
  INSTANCE_EXISTS: 409,
  INSTANCE_NOT_ACTIVE: 409,
  INSTANCE_NOT_BLOCKED: 409,
  STALE_STAGE: 409,
  STAGE_NOT_OPEN: 409,
  HANDOVER_NOT_PENDING: 409,
  HANDOVER_PENDING: 409,
  VERSION_EXISTS: 409,
  VERSION_NOT_DRAFT: 409,
  TASKS_INCOMPLETE: 422,
  GATE_FAILED: 422,
  GATE_NOT_OVERRIDABLE: 422,
  OUTCOME_REQUIRED: 422,
  OUTCOME_INVALID: 422,
  OUTCOME_REASON_REQUIRED: 422,
  REASON_REQUIRED: 422,
  EVIDENCE_REQUIRED: 422,
  HANDOVER_PAYLOAD_REQUIRED: 422,
  HANDOVER_NO_RETURN_PATH: 422,
  NOT_A_HANDOVER_STAGE: 422,
  TRANSITION_AMBIGUOUS: 422,
  START_STAGE_REQUIRES_IMPORT: 422,
  DEFINITION_INVALID: 422,
  TRANSITION_TARGET_MISSING: 422,
  NO_START_STAGE: 422,
  INVALID_TASK_STATUS: 422,
};

export class ProcessError extends Error {
  code: string;
  status: number;
  /** For GATE_FAILED: which gate. */
  gateKey: string | null;

  constructor(
    code: string,
    message: string,
    status?: number,
    gateKey: string | null = null,
  ) {
    super(message);
    this.name = "ProcessError";
    this.code = code;
    this.status = status ?? PROCESS_ERROR_STATUS[code] ?? 500;
    this.gateKey = gateKey;
  }
}

/** Turn a raised `CODE: message` (or `GATE_FAILED:KEY: message`) into a ProcessError. */
export function processErrorFromMessage(
  raw: string | null | undefined,
): ProcessError {
  const text = (raw ?? "").trim();
  const gate = /^GATE_FAILED:([A-Z0-9_]+):\s*(.*)$/s.exec(text);
  if (gate)
    return new ProcessError(
      "GATE_FAILED",
      gate[2] || "Gate failed",
      422,
      gate[1],
    );
  const m = /^([A-Z][A-Z0-9_]+):\s*(.*)$/s.exec(text);
  if (m && PROCESS_ERROR_STATUS[m[1]] !== undefined) {
    return new ProcessError(m[1], m[2] || m[1]);
  }
  return new ProcessError(
    "PROCESS_ERROR",
    text || "Process operation failed",
    500,
  );
}

export function isProcessError(err: unknown): err is ProcessError {
  return err instanceof ProcessError;
}
