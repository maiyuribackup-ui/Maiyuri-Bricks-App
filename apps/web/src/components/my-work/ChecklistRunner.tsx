"use client";

import { Camera, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { onehub } from "@/lib/onehub-theme";
import type {
  ChecklistResponseStatus,
  WorkChecklistResponse,
  WorkChecklistTemplateItem,
  WorkItemAttachment,
} from "@maiyuri/shared";
import type { ValidationIssue } from "@/lib/my-work-utils";

export interface DraftResponse {
  template_item_id: string;
  status: ChecklistResponseStatus | null;
  text_value: string | null;
  number_value: number | null;
  note: string | null;
  fail_reason: string | null;
  corrective_action: string | null;
}

interface ChecklistRunnerProps {
  templateItems: WorkChecklistTemplateItem[];
  drafts: Record<string, DraftResponse>;
  savedResponses: WorkChecklistResponse[];
  attachments: WorkItemAttachment[];
  issues: ValidationIssue[];
  readOnly: boolean;
  onChange: (itemId: string, patch: Partial<DraftResponse>) => void;
  onAddPhoto: (templateItemId: string) => void;
}

const STATUS_OPTIONS: {
  value: ChecklistResponseStatus;
  label: string;
  icon: typeof CheckCircle2;
  fg: string;
  bg: string;
}[] = [
  { value: "completed", label: "Completed", icon: CheckCircle2, fg: "#3f7d4d", bg: "#e4f1e3" },
  { value: "not_completed", label: "Not Completed", icon: XCircle, fg: "#c1453e", bg: "#fbe4df" },
  { value: "not_applicable", label: "N/A", icon: MinusCircle, fg: "#9c8676", bg: "#f3ece1" },
];

export function ChecklistRunner({
  templateItems,
  drafts,
  savedResponses,
  attachments,
  issues,
  readOnly,
  onChange,
  onAddPhoto,
}: ChecklistRunnerProps) {
  const responseIdByItem = new Map(
    savedResponses.map((r) => [r.template_item_id, r.id]),
  );
  const photosByItem = new Map<string, WorkItemAttachment[]>();
  for (const att of attachments) {
    if (!att.checklist_response_id) continue;
    const itemId = savedResponses.find(
      (r) => r.id === att.checklist_response_id,
    )?.template_item_id;
    if (!itemId) continue;
    photosByItem.set(itemId, [...(photosByItem.get(itemId) ?? []), att]);
  }
  const issuesByItem = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    if (!issue.template_item_id) continue;
    issuesByItem.set(issue.template_item_id, [
      ...(issuesByItem.get(issue.template_item_id) ?? []),
      issue,
    ]);
  }

  return (
    <div className="space-y-3">
      {templateItems.map((tplItem, index) => {
        const draft = drafts[tplItem.id];
        const itemIssues = issuesByItem.get(tplItem.id) ?? [];
        const failed = draft?.status === "not_completed";
        const photos = photosByItem.get(tplItem.id) ?? [];
        const needsPhoto =
          tplItem.requires_photo || (failed && tplItem.requires_photo_on_fail);

        return (
          <div
            key={tplItem.id}
            className="rounded-2xl border p-4"
            style={{
              background: onehub.card,
              borderColor:
                itemIssues.length > 0 || failed ? "#eec3ba" : onehub.cardBorder,
            }}
          >
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "#f3ece1", color: onehub.textMuted }}
              >
                {index + 1}
              </span>
              <p className="text-sm font-semibold" style={{ color: onehub.text }}>
                {tplItem.prompt}
                {tplItem.mandatory && (
                  <span style={{ color: onehub.high.fg }}> *</span>
                )}
              </p>
            </div>

            {/* Status radios */}
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUS_OPTIONS.filter(
                (o) => o.value !== "not_applicable" || tplItem.allow_na,
              ).map((option) => {
                const Icon = option.icon;
                const selected = draft?.status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={readOnly}
                    onClick={() =>
                      onChange(tplItem.id, {
                        status: selected ? null : option.value,
                      })
                    }
                    className="flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60"
                    style={
                      selected
                        ? { background: option.bg, color: option.fg, borderColor: option.fg }
                        : { background: "#fff", color: onehub.textMuted, borderColor: onehub.cardBorder }
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            {/* Typed inputs */}
            {tplItem.input_type === "text" && (
              <textarea
                value={draft?.text_value ?? ""}
                disabled={readOnly}
                onChange={(e) => onChange(tplItem.id, { text_value: e.target.value })}
                placeholder="Type your answer…"
                rows={2}
                className="mt-3 w-full rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-60"
                style={{ borderColor: onehub.cardBorder, color: onehub.text }}
              />
            )}
            {tplItem.input_type === "number" && (
              <input
                type="number"
                inputMode="decimal"
                value={draft?.number_value ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  onChange(tplItem.id, {
                    number_value:
                      e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
                placeholder="Enter value"
                className="mt-3 w-40 rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-60"
                style={{ borderColor: onehub.cardBorder, color: onehub.text }}
              />
            )}

            {/* Fail follow-ups */}
            {failed && (
              <div
                className="mt-3 space-y-2 rounded-xl p-3"
                style={{ background: "#fdf1ee" }}
              >
                <input
                  value={draft?.fail_reason ?? ""}
                  disabled={readOnly}
                  onChange={(e) => onChange(tplItem.id, { fail_reason: e.target.value })}
                  placeholder="Why was this not completed? (required)"
                  className="w-full rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-60"
                  style={{ borderColor: "#eec3ba", color: onehub.text }}
                />
                {tplItem.requires_corrective_action_on_fail && (
                  <input
                    value={draft?.corrective_action ?? ""}
                    disabled={readOnly}
                    onChange={(e) =>
                      onChange(tplItem.id, { corrective_action: e.target.value })
                    }
                    placeholder="Corrective action (required)"
                    className="w-full rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-60"
                    style={{ borderColor: "#eec3ba", color: onehub.text }}
                  />
                )}
              </div>
            )}

            {/* Optional note */}
            {!readOnly && (
              <input
                value={draft?.note ?? ""}
                onChange={(e) => onChange(tplItem.id, { note: e.target.value })}
                placeholder="Add a note (optional)"
                className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-xs"
                style={{ borderColor: onehub.cardBorder, color: onehub.text }}
              />
            )}
            {readOnly && draft?.note && (
              <p className="mt-2 text-xs" style={{ color: onehub.textMuted }}>
                Note: {draft.note}
              </p>
            )}

            {/* Photos */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {photos.map((photo) =>
                photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={photo.url}
                    alt={photo.caption ?? photo.file_name}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                ) : null,
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    // Photos need a saved response row to attach to — the
                    // parent saves the draft first if necessary.
                    if (!responseIdByItem.has(tplItem.id)) {
                      onChange(tplItem.id, {});
                    }
                    onAddPhoto(tplItem.id);
                  }}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-dashed px-3.5 py-2 text-xs font-medium"
                  style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}
                >
                  <Camera className="h-4 w-4" />
                  {needsPhoto ? "Add Photo (required)" : "Add Photo"}
                </button>
              )}
            </div>

            {/* Validation messages */}
            {itemIssues.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {itemIssues.map((issue, i) => (
                  <li key={i} className="text-xs font-medium" style={{ color: "#c1453e" }}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
