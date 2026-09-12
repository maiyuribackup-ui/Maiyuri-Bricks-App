"use client";

/**
 * Dialogs used by the stage panel: return a handover with an exception,
 * compose a handover package, raise an exception (block), override a gate.
 * All are plain forms with big tap targets (PRD §24) on top of @maiyuri/ui Modal.
 */
import { useState } from "react";
import { Modal } from "@maiyuri/ui";
import {
  HANDOVER_REJECTION_LABELS,
  type HandoverRejectionCode,
  type ProcessHandoverPayload,
  type ProcessInstanceContext,
  type RejectHandoverInput,
} from "@maiyuri/shared";
import { humanizeKey } from "./ProcessGateList";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-white";
const labelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
export const primaryButtonClass =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
export const dangerButtonClass =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950";

function DialogFooter({
  onCancel,
  submitLabel,
  busy,
  danger = false,
  disabled = false,
}: {
  onCancel: () => void;
  submitLabel: string;
  busy: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className={secondaryButtonClass}
        disabled={busy}
      >
        Cancel
      </button>
      <button
        type="submit"
        className={danger ? dangerButtonClass : primaryButtonClass}
        disabled={busy || disabled}
      >
        {busy ? "Working…" : submitLabel}
      </button>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300"
    >
      {error}
    </p>
  );
}

// ============================================
// Return handover with exception
// ============================================

export interface RejectHandoverDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: RejectHandoverInput) => Promise<void>;
  busy?: boolean;
  error?: string | null;
}

export function RejectHandoverDialog({
  isOpen,
  onClose,
  onSubmit,
  busy = false,
  error = null,
}: RejectHandoverDialogProps) {
  const [reasonCode, setReasonCode] =
    useState<HandoverRejectionCode>("INSUFFICIENT_STOCK");
  const [comment, setComment] = useState("");
  const [proposedDate, setProposedDate] = useState("");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Return with exception">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({
            reason_code: reasonCode,
            comment: comment.trim(),
            proposed_date: proposedDate || undefined,
          });
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="reject-reason" className={labelClass}>
            Reason
          </label>
          <select
            id="reject-reason"
            value={reasonCode}
            onChange={(e) =>
              setReasonCode(e.target.value as HandoverRejectionCode)
            }
            className={inputClass}
          >
            {(
              Object.keys(HANDOVER_REJECTION_LABELS) as HandoverRejectionCode[]
            ).map((code) => (
              <option key={code} value={code}>
                {HANDOVER_REJECTION_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reject-comment" className={labelClass}>
            What should sales tell the customer?
          </label>
          <textarea
            id="reject-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            required
            minLength={3}
            className={inputClass}
            placeholder="e.g. Only 6,000 in stock; can commit 18,500 by 21 Sep"
          />
        </div>
        <div>
          <label htmlFor="reject-date" className={labelClass}>
            Achievable date (optional)
          </label>
          <input
            id="reject-date"
            type="date"
            value={proposedDate}
            onChange={(e) => setProposedDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <ErrorLine error={error} />
        <DialogFooter
          onCancel={onClose}
          submitLabel="Return to sender"
          busy={busy}
          danger
          disabled={comment.trim().length < 3}
        />
      </form>
    </Modal>
  );
}

// ============================================
// Handover package (sender fills before advancing into a HANDOVER stage)
// ============================================

export interface HandoverPackageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fields from the target stage's config.handover_payload_fields. */
  fields: string[];
  context: ProcessInstanceContext;
  onSubmit: (payload: ProcessHandoverPayload) => Promise<void>;
  busy?: boolean;
  error?: string | null;
  title?: string;
}

const DEFAULT_PACKAGE_FIELDS = [
  "customer_name",
  "product_name",
  "quantity",
  "requested_delivery_date",
  "site_location",
  "contact_person",
  "notes",
];

const NUMERIC_FIELDS = new Set(["quantity"]);
const DATE_FIELDS = new Set(["requested_delivery_date"]);
const LONG_FIELDS = new Set(["notes", "special_requirements", "commitments"]);

/** Prefill from the case context; order_ref falls back to the Odoo SO name. */
export function prefillHandover(
  fields: string[],
  context: ProcessInstanceContext,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const raw =
      field === "order_ref"
        ? (context.order_ref ?? context.odoo_order_name)
        : context[field];
    out[field] = raw === undefined || raw === null ? "" : String(raw);
  }
  return out;
}

export function HandoverPackageDialog({
  isOpen,
  onClose,
  fields,
  context,
  onSubmit,
  busy = false,
  error = null,
  title = "Handover package",
}: HandoverPackageDialogProps) {
  const effectiveFields = fields.length > 0 ? fields : DEFAULT_PACKAGE_FIELDS;
  const [values, setValues] = useState<Record<string, string>>(() =>
    prefillHandover(effectiveFields, context),
  );

  const set = (field: string, value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        The receiver sees exactly this. Fill what the factory needs to accept
        without calling you back.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const payload: ProcessHandoverPayload = {};
          for (const field of effectiveFields) {
            const v = values[field] ?? "";
            if (v === "") continue;
            payload[field] = NUMERIC_FIELDS.has(field) ? Number(v) : v;
          }
          await onSubmit(payload);
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {effectiveFields.map((field) => {
          const id = `handover-${field}`;
          const long = LONG_FIELDS.has(field);
          return (
            <div key={field} className={long ? "sm:col-span-2" : ""}>
              <label htmlFor={id} className={labelClass}>
                {humanizeKey(field)}
              </label>
              {long ? (
                <textarea
                  id={id}
                  rows={2}
                  value={values[field] ?? ""}
                  onChange={(e) => set(field, e.target.value)}
                  className={inputClass}
                />
              ) : (
                <input
                  id={id}
                  type={
                    NUMERIC_FIELDS.has(field)
                      ? "number"
                      : DATE_FIELDS.has(field)
                        ? "date"
                        : "text"
                  }
                  value={values[field] ?? ""}
                  onChange={(e) => set(field, e.target.value)}
                  className={inputClass}
                />
              )}
            </div>
          );
        })}
        <div className="sm:col-span-2">
          <ErrorLine error={error} />
          <DialogFooter
            onCancel={onClose}
            submitLabel="Send handover"
            busy={busy}
          />
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// Raise exception (block)
// ============================================

export interface BlockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: {
    code: string;
    message: string;
    proposed_date?: string;
  }) => Promise<void>;
  busy?: boolean;
  error?: string | null;
}

const BLOCK_CODES = [
  "CUSTOMER_WAITING",
  "STOCK",
  "CAPACITY",
  "RAW_MATERIAL",
  "PAYMENT",
  "QUALITY",
  "TRANSPORT",
  "OTHER",
];

export function BlockDialog({
  isOpen,
  onClose,
  onSubmit,
  busy = false,
  error = null,
}: BlockDialogProps) {
  const [code, setCode] = useState(BLOCK_CODES[0] ?? "OTHER");
  const [message, setMessage] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Raise exception">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({
            code,
            message: message.trim(),
            proposed_date: proposedDate || undefined,
          });
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="block-code" className={labelClass}>
            What is blocking you?
          </label>
          <select
            id="block-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
          >
            {BLOCK_CODES.map((c) => (
              <option key={c} value={c}>
                {humanizeKey(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="block-message" className={labelClass}>
            Details
          </label>
          <textarea
            id="block-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            required
            minLength={2}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="block-date" className={labelClass}>
            Expected to clear by (optional)
          </label>
          <input
            id="block-date"
            type="date"
            value={proposedDate}
            onChange={(e) => setProposedDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <ErrorLine error={error} />
        <DialogFooter
          onCancel={onClose}
          submitLabel="Raise exception"
          busy={busy}
          danger
          disabled={message.trim().length < 2}
        />
      </form>
    </Modal>
  );
}

// ============================================
// Override gate (Managing Partner)
// ============================================

export interface OverrideDialogProps {
  isOpen: boolean;
  gateKey: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  busy?: boolean;
  error?: string | null;
}

export function OverrideDialog({
  isOpen,
  gateKey,
  onClose,
  onSubmit,
  busy = false,
  error = null,
}: OverrideDialogProps) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Override gate: ${gateKey ? humanizeKey(gateKey) : ""}`}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit(reason.trim());
        }}
        className="space-y-4"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This is recorded on the case history with your name. Say why the
          business is proceeding anyway.
        </p>
        <div>
          <label htmlFor="override-reason" className={labelClass}>
            Reason (required)
          </label>
          <textarea
            id="override-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            minLength={5}
            className={inputClass}
          />
        </div>
        <ErrorLine error={error} />
        <DialogFooter
          onCancel={onClose}
          submitLabel="Override"
          busy={busy}
          danger
          disabled={reason.trim().length < 5}
        />
      </form>
    </Modal>
  );
}

// ============================================
// Attach evidence (text note or URL)
// ============================================

export interface EvidenceDialogProps {
  isOpen: boolean;
  taskTitle: string | null;
  onClose: () => void;
  onSubmit: (input: {
    source_type: "text" | "url";
    value: string;
  }) => Promise<void>;
  busy?: boolean;
  error?: string | null;
}

export function EvidenceDialog({
  isOpen,
  taskTitle,
  onClose,
  onSubmit,
  busy = false,
  error = null,
}: EvidenceDialogProps) {
  const [sourceType, setSourceType] = useState<"text" | "url">("text");
  const [value, setValue] = useState("");
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={taskTitle ? `Attach evidence: ${taskTitle}` : "Attach evidence"}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({ source_type: sourceType, value: value.trim() });
        }}
        className="space-y-4"
      >
        <div
          className="flex gap-2"
          role="radiogroup"
          aria-label="Evidence kind"
        >
          {(["text", "url"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={sourceType === kind}
              onClick={() => setSourceType(kind)}
              className={`min-h-[44px] flex-1 rounded-xl border px-3 text-sm font-semibold ${
                sourceType === kind
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
              }`}
            >
              {kind === "text" ? "Note" : "Link"}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="evidence-value" className={labelClass}>
            {sourceType === "text" ? "Note" : "URL"}
          </label>
          {sourceType === "text" ? (
            <textarea
              id="evidence-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              required
              className={inputClass}
            />
          ) : (
            <input
              id="evidence-value"
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              className={inputClass}
              placeholder="https://"
            />
          )}
        </div>
        <ErrorLine error={error} />
        <DialogFooter
          onCancel={onClose}
          submitLabel="Attach"
          busy={busy}
          disabled={value.trim().length === 0}
        />
      </form>
    </Modal>
  );
}
