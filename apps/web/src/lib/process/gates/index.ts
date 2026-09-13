/**
 * Gate evaluators (PRD §9 "Exit Gate", §29). PURE: each takes the gate row and
 * a bag of already-loaded facts and returns ok / fail / unknown. Unknown always
 * blocks (plan D7) — a gate that cannot be evaluated never passes.
 *
 * Facts are loaded once per evaluation by `facts/index.ts`, so a stage with
 * three gates reading the lead costs one query, not three.
 */
import type {
  ProcessEvidenceRow,
  ProcessGateResult,
  ProcessGateRow,
  ProcessHandoverRow,
  ProcessQcReleaseRow,
  ProcessTaskRow,
} from "@maiyuri/shared";
import { userHasProcessRole, type RoleDefaults } from "../permissions";

export interface PaymentFact {
  order_total: number;
  paid_amount: number;
  paid_percent: number;
  invoice_count: number;
}

export interface StockFact {
  /** false when the order has no synced demand lines yet */
  has_demand: boolean;
  lines: {
    so_line_id: string;
    product_name: string;
    remaining: number;
    ready_now: number;
    ready_from: string | null;
    uncovered: number;
  }[];
  as_of: string;
  fully_ready: boolean;
}

export interface GateFacts {
  entity: Record<string, unknown> | null;
  tasks: ProcessTaskRow[];
  evidence: (ProcessEvidenceRow & { added_by_role?: string | null })[];
  handover: ProcessHandoverRow | null;
  outcome: string | null;
  payment: PaymentFact | null;
  stock: StockFact | null;
  linked_record: { type: string; id: string; status: string | null } | null;
  /** Latest QC record on the stage, with the checker's app role. */
  qc_release:
    | (ProcessQcReleaseRow & { checked_by_role?: string | null })
    | null;
  overridden: Set<string>;
  /** Designated role holders — a holder counts as having the role. */
  role_defaults: RoleDefaults;
  /** Loader failures keyed by fact name — turn the dependent gates unknown. */
  errors: Record<string, string>;
}

export function emptyFacts(): GateFacts {
  return {
    entity: null,
    tasks: [],
    evidence: [],
    handover: null,
    outcome: null,
    payment: null,
    stock: null,
    linked_record: null,
    qc_release: null,
    overridden: new Set(),
    role_defaults: {},
    errors: {},
  };
}

type EvidenceLike = GateFacts["evidence"][number];
function addedByRole(
  e: EvidenceLike,
  roleKey: string,
  facts: GateFacts,
): boolean {
  return userHasProcessRole(
    e.added_by_role,
    roleKey as never,
    e.added_by,
    facts.role_defaults,
  );
}

type Verdict = { status: "ok" | "fail" | "unknown"; message: string | null };

const ok = (message: string | null = null): Verdict => ({
  status: "ok",
  message,
});
const fail = (message: string): Verdict => ({ status: "fail", message });
const unknown = (message: string): Verdict => ({ status: "unknown", message });

function condStr(c: Record<string, unknown>, key: string): string | null {
  const v = c[key];
  return typeof v === "string" ? v : null;
}
function condNum(
  c: Record<string, unknown>,
  key: string,
  dflt: number,
): number {
  const v = c[key];
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}
function condBool(
  c: Record<string, unknown>,
  key: string,
  dflt: boolean,
): boolean {
  const v = c[key];
  return typeof v === "boolean" ? v : dflt;
}
function condList(c: Record<string, unknown>, key: string): unknown[] | null {
  const v = c[key];
  return Array.isArray(v) ? v : null;
}

function evalChecklist(facts: GateFacts): Verdict {
  const open = facts.tasks.filter((t) => t.required && t.status === "open");
  return open.length === 0
    ? ok()
    : fail(
        `${open.length} required item${open.length === 1 ? "" : "s"} still open`,
      );
}

function evalEntityField(gate: ProcessGateRow, facts: GateFacts): Verdict {
  if (facts.errors.entity) return unknown(facts.errors.entity);
  const field = condStr(gate.condition, "field");
  if (!field) return unknown("Gate is missing condition.field");
  if (!facts.entity) return fail("The linked record could not be found");
  const value = facts.entity[field];
  const c = gate.condition;
  if (condBool(c, "exists", false))
    return value !== undefined && value !== null
      ? ok()
      : fail(`${field} is missing`);
  if (condBool(c, "not_null", false))
    return value !== null && value !== undefined && value !== ""
      ? ok()
      : fail(`${field} is not set`);
  const inList = condList(c, "in");
  if (inList)
    return inList.includes(value) ? ok() : fail(`${field} is ${String(value)}`);
  const notIn = condList(c, "not_in");
  if (notIn)
    return notIn.includes(value)
      ? fail(`${field} is still ${String(value)}`)
      : ok();
  if ("eq" in c)
    return value === c.eq
      ? ok()
      : fail(`${field} is ${String(value)}, expected ${String(c.eq)}`);
  return unknown(
    "Gate has no recognised condition (exists / not_null / in / not_in / eq)",
  );
}

function evalQuoteLinked(facts: GateFacts): Verdict {
  if (facts.errors.entity) return unknown(facts.errors.entity);
  const id = facts.entity?.odoo_quote_id;
  return typeof id === "number" && id > 0
    ? ok(`Odoo quotation #${id}`)
    : fail("No Odoo quotation linked");
}

function evalAdvance(gate: ProcessGateRow, facts: GateFacts): Verdict {
  const c = gate.condition;
  const minPercent = condNum(c, "min_percent", 0);
  // Path 1: an authorised finance user attached the payment reference.
  const finance = facts.evidence.find(
    (e) =>
      e.evidence_type === "payment_reference" &&
      addedByRole(e, "FINANCE", facts),
  );
  if (finance) return ok("Verified by finance (payment reference attached)");
  const unauthorised = facts.evidence.find(
    (e) => e.evidence_type === "payment_reference",
  );
  // Path 2: authoritative Odoo figure, when enabled.
  if (condBool(c, "auto_from_odoo", false)) {
    if (facts.errors.payment) return unknown(facts.errors.payment);
    if (!facts.payment)
      return unknown("No Odoo order to read the payment from");
    if (
      facts.payment.paid_percent >= minPercent &&
      facts.payment.paid_amount > 0
    ) {
      return ok(`Odoo shows ${Math.round(facts.payment.paid_percent)}% paid`);
    }
    return fail(
      `Odoo shows ${Math.round(facts.payment.paid_percent)}% paid, ${minPercent}% required`,
    );
  }
  if (unauthorised)
    return fail("Payment reference must be attached by Finance, not Sales");
  return fail("Advance is not verified");
}

function evalHandover(facts: GateFacts): Verdict {
  if (!facts.handover) return fail("No handover has been sent");
  if (facts.handover.status === "ACCEPTED") return ok("Accepted");
  if (facts.handover.status === "REJECTED")
    return fail("Handover was returned with an exception");
  return fail("Waiting for the receiver to accept the handover");
}

function evalStock(gate: ProcessGateRow, facts: GateFacts): Verdict {
  if (facts.errors.stock) return unknown(facts.errors.stock);
  if (!facts.stock) return unknown("Stock position is not available");
  if (!facts.stock.has_demand)
    return unknown("The order has no synced demand lines in ops-control yet");
  if (facts.stock.fully_ready)
    return ok(`Stock ready as of ${facts.stock.as_of}`);
  const short = facts.stock.lines.filter((l) => l.ready_now < l.remaining);
  const detail = short
    .map(
      (l) =>
        `${l.product_name}: ${l.ready_now}/${l.remaining} ready${l.ready_from ? `, rest from ${l.ready_from}` : ""}`,
    )
    .join("; ");
  void gate;
  return fail(detail || "Reserved stock does not cover the order");
}

function evalManual(gate: ProcessGateRow, facts: GateFacts): Verdict {
  const role = condStr(gate.condition, "role");
  const type = condStr(gate.condition, "evidence_type") ?? "note";
  const hit = facts.evidence.find(
    (e) => e.evidence_type === type && (!role || addedByRole(e, role, facts)),
  );
  if (hit) return ok(`${type.replace(/_/g, " ")} recorded`);
  const wrongRole = facts.evidence.find((e) => e.evidence_type === type);
  if (wrongRole && role)
    return fail(
      `${type.replace(/_/g, " ")} must be recorded by ${role.replace(/_/g, " ")}`,
    );
  return fail(`${type.replace(/_/g, " ")} has not been recorded`);
}

function evalLinked(gate: ProcessGateRow, facts: GateFacts): Verdict {
  if (facts.errors.linked_record) return unknown(facts.errors.linked_record);
  const wanted = condStr(gate.condition, "status");
  const type = condStr(gate.condition, "type");
  if (!facts.linked_record) {
    return condBool(gate.condition, "optional", false)
      ? ok("No linked record to check")
      : fail(`Link the ${type ?? "record"} first`);
  }
  if (type && facts.linked_record.type !== type)
    return fail(
      `Linked record is a ${facts.linked_record.type}, expected ${type}`,
    );
  if (facts.linked_record.status === null)
    return unknown(`Linked ${facts.linked_record.type} was not found`);
  if (!wanted) return ok();
  return facts.linked_record.status === wanted
    ? ok(`${facts.linked_record.type} is ${wanted}`)
    : fail(
        `${facts.linked_record.type} is ${facts.linked_record.status}, expected ${wanted}`,
      );
}

/**
 * A real QC record decides (never a note): the latest record on the stage
 * must be a release made by the factory manager. A later hold re-blocks.
 */
function evalQcReleased(facts: GateFacts): Verdict {
  if (facts.errors.qc_release) return unknown(facts.errors.qc_release);
  const qc = facts.qc_release;
  if (!qc) return fail("No QC release has been recorded");
  if (qc.result === "hold")
    return fail(
      `QC hold on ${qc.quantity} × ${qc.product_name}${qc.batch_ref ? ` (batch ${qc.batch_ref})` : ""}`,
    );
  if (
    !userHasProcessRole(
      qc.checked_by_role,
      "FACTORY_MANAGER",
      qc.checked_by,
      facts.role_defaults,
    )
  )
    return fail("QC release must be recorded by the Factory Manager");
  return ok(
    `Released ${qc.quantity} × ${qc.product_name}${qc.batch_ref ? ` (batch ${qc.batch_ref})` : ""}`,
  );
}

function evalDecision(gate: ProcessGateRow, facts: GateFacts): Verdict {
  if (!facts.outcome) return fail("Choose an outcome");
  const allowed = condList(gate.condition, "in");
  if (allowed && !allowed.includes(facts.outcome))
    return fail(`${facts.outcome} is not an allowed outcome`);
  return ok(facts.outcome);
}

export function evaluateGate(
  gate: ProcessGateRow,
  facts: GateFacts,
): ProcessGateResult {
  if (facts.overridden.has(gate.gate_key)) {
    return {
      gate_key: gate.gate_key,
      gate_type: gate.gate_type,
      status: "overridden",
      message: "Overridden by a Managing Partner",
      overridable: gate.overridable,
    };
  }
  let v: Verdict;
  switch (gate.gate_type) {
    case "checklist_complete":
      v = evalChecklist(facts);
      break;
    case "entity_field":
      v = evalEntityField(gate, facts);
      break;
    case "odoo_quote_linked":
      v = evalQuoteLinked(facts);
      break;
    case "advance_verified":
      v = evalAdvance(gate, facts);
      break;
    case "handover_accepted":
      v = evalHandover(facts);
      break;
    case "stock_feasible":
      v = evalStock(gate, facts);
      break;
    case "manual_confirmation":
      v = evalManual(gate, facts);
      break;
    case "linked_record_status":
      v = evalLinked(gate, facts);
      break;
    case "decision_outcome":
      v = evalDecision(gate, facts);
      break;
    case "qc_released":
      v = evalQcReleased(facts);
      break;
    default:
      v = unknown(`Unknown gate type ${String(gate.gate_type)}`);
  }
  let message = v.message;
  if (v.status !== "ok" && gate.failure_message) {
    message = v.message
      ? `${gate.failure_message} (${v.message})`
      : gate.failure_message;
  }
  return {
    gate_key: gate.gate_key,
    gate_type: gate.gate_type,
    status: v.status,
    message,
    overridable: gate.overridable,
  };
}

export function evaluateGates(
  gates: ProcessGateRow[],
  facts: GateFacts,
): ProcessGateResult[] {
  return gates.map((g) => evaluateGate(g, facts));
}

/** The shape `process_advance` expects in p_gate_results. */
export function gateResultsPayload(
  results: ProcessGateResult[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of results)
    out[r.gate_key] = r.status === "overridden" ? "ok" : r.status;
  return out;
}

export function firstBlockingGate(
  results: ProcessGateResult[],
): ProcessGateResult | null {
  return (
    results.find((r) => r.status === "fail" || r.status === "unknown") ?? null
  );
}
