"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock,
  History,
  Tag,
  Trash2,
} from "lucide-react";
import {
  useCompleteWorkItem,
  useRemoveWorkPhoto,
  useSaveDraft,
  useStartWorkItem,
  useSubmitWorkItem,
  useUploadWorkPhoto,
  useWorkItem,
} from "@/hooks/useMyWork";
import {
  ChecklistRunner,
  type DraftResponse,
} from "@/components/my-work/ChecklistRunner";
import { isEditable, type ValidationIssue } from "@/lib/my-work-utils";
import { onehub } from "@/lib/onehub-theme";
import { WORK_STATUS_LABELS } from "@maiyuri/shared";

export default function WorkItemDetailPage() {
  const params = useParams();
  const workItemId = params.id as string;

  const { data, isLoading, refetch } = useWorkItem(workItemId);
  const item = data?.data;

  const startMutation = useStartWorkItem();
  const draftMutation = useSaveDraft();
  const completeMutation = useCompleteWorkItem();
  const submitMutation = useSubmitWorkItem();
  const uploadMutation = useUploadWorkPhoto();
  const removeMutation = useRemoveWorkPhoto();

  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftResponse>>({});
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pendingChecklistItemRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editable = item ? isEditable(item.status) : false;
  const templateItems = item?.checklist_instance?.template?.items ?? [];
  const savedResponses = item?.checklist_instance?.responses ?? [];
  const attachments = item?.attachments ?? [];
  const itemLevelPhotos = attachments.filter((a) => !a.checklist_response_id);

  // Hydrate local editing state once the item loads
  useEffect(() => {
    if (!item) return;
    setNote(item.note ?? "");
    const next: Record<string, DraftResponse> = {};
    for (const tpl of templateItems) {
      const saved = savedResponses.find((r) => r.template_item_id === tpl.id);
      next[tpl.id] = {
        template_item_id: tpl.id,
        status: saved?.status ?? null,
        text_value: saved?.text_value ?? null,
        number_value: saved?.number_value ?? null,
        note: saved?.note ?? null,
        fail_reason: saved?.fail_reason ?? null,
        corrective_action: saved?.corrective_action ?? null,
      };
    }
    setDrafts(next);
  }, [item?.id, item?.updated_at]);

  // Warn before leaving with unsaved changes (PRD §11)
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const saveDraft = useCallback(
    async (immediate = false) => {
      if (!item || !editable) return;
      const doSave = async () => {
        try {
          const result = await draftMutation.mutateAsync({
            id: item.id,
            draft: {
              note,
              responses: Object.values(drafts),
            },
          });
          setLastSavedAt(result.data.saved_at);
          setDirty(false);
        } catch {
          // Keep local state; the user sees "Unsaved changes" and can retry
        }
      };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (immediate) {
        await doSave();
      } else {
        saveTimerRef.current = setTimeout(doSave, 1500);
      }
    },
    [item, editable, note, drafts, draftMutation],
  );

  // Debounced autosave whenever the user edits
  useEffect(() => {
    if (!dirty) return;
    saveDraft(false);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [note, drafts, dirty]);

  const handleChecklistChange = (
    itemId: string,
    patch: Partial<DraftResponse>,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
    setDirty(true);
    setIssues((prev) => prev.filter((i) => i.template_item_id !== itemId));
  };

  const handleAddPhoto = async (templateItemId: string | null) => {
    pendingChecklistItemRef.current = templateItemId;
    // Checklist photos attach to a response row — make sure it exists
    if (templateItemId) await saveDraft(true);
    cameraInputRef.current?.click();
  };

  const handleFileChosen = async (file: File | null) => {
    if (!file || !item) return;
    setActionError(null);
    const templateItemId = pendingChecklistItemRef.current;
    pendingChecklistItemRef.current = null;
    try {
      let checklistResponseId: string | undefined;
      if (templateItemId) {
        const fresh = await refetch();
        checklistResponseId = fresh.data?.data?.checklist_instance?.responses?.find(
          (r) => r.template_item_id === templateItemId,
        )?.id;
      }
      await uploadMutation.mutateAsync({
        id: item.id,
        file,
        checklistResponseId,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Photo upload failed");
    }
  };

  const handlePrimaryAction = async () => {
    if (!item) return;
    setActionError(null);
    setIssues([]);
    try {
      if (item.status === "pending" || item.status === "returned") {
        await startMutation.mutateAsync(item.id);
        return;
      }
      await saveDraft(true);
      if (item.activity_type === "checklist") {
        await submitMutation.mutateAsync(item.id);
      } else {
        await completeMutation.mutateAsync({ id: item.id, note });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      // Structured checklist validation issues from /submit
      try {
        const parsed = JSON.parse(message);
        if (parsed.validation_issues) {
          setIssues(parsed.validation_issues);
          setActionError("Please fix the highlighted items before submitting.");
          return;
        }
      } catch {
        /* not JSON — fall through */
      }
      setActionError(message);
    }
  };

  const primaryLabel = useMemo(() => {
    if (!item) return "";
    if (item.status === "pending" || item.status === "returned")
      return item.activity_type === "checklist" ? "Start Checklist" : "Start";
    if (item.activity_type === "checklist") return "Submit Checklist";
    return "Mark Complete";
  }, [item]);

  const busy =
    startMutation.isPending ||
    completeMutation.isPending ||
    submitMutation.isPending;

  if (isLoading || !item) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border"
            style={{ background: onehub.card, borderColor: onehub.cardBorder }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-32">
      {/* Hidden capture inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFileChosen(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFileChosen(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <Link
        href="/onehub/my-work"
        className="inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: onehub.textMuted }}
        onClick={(e) => {
          if (dirty && !confirm("You have unsaved changes. Leave anyway?")) {
            e.preventDefault();
          }
        }}
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Work
      </Link>

      {/* Header card */}
      <div
        className="mt-3 rounded-2xl border p-4"
        style={{ background: onehub.card, borderColor: onehub.cardBorder }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: onehub.brand, background: "#f3e3de" }}
          >
            {WORK_STATUS_LABELS[item.status]}
          </span>
          {item.priority !== "medium" && item.priority !== "low" && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: onehub.high.fg, background: onehub.high.bg }}
            >
              {item.priority === "urgent" ? "Urgent" : "High Priority"}
            </span>
          )}
        </div>
        <h1 className="mt-2 font-serif text-xl font-bold" style={{ color: onehub.brand }}>
          {item.title}
        </h1>
        <div
          className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
          style={{ color: onehub.textMuted }}
        >
          {item.due_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Due {new Date(item.due_at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          {item.related_label && (
            <span className="flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" />
              {item.related_label}
            </span>
          )}
          {item.linked_sop_slug && (
            <Link
              href={`/onehub#sop-library`}
              className="flex items-center gap-1 underline"
              style={{ color: onehub.accent }}
            >
              <BookOpen className="h-3.5 w-3.5" /> View SOP
            </Link>
          )}
        </div>
        {item.status === "returned" && item.return_reason && (
          <p
            className="mt-3 rounded-xl p-3 text-sm"
            style={{ background: "#fdf1ee", color: "#c1453e" }}
          >
            Returned for correction: {item.return_reason}
          </p>
        )}
        {item.instructions && (
          <p className="mt-3 whitespace-pre-wrap text-sm" style={{ color: onehub.text }}>
            {item.instructions}
          </p>
        )}
      </div>

      {/* Checklist */}
      {templateItems.length > 0 && (
        <section className="mt-4">
          <h2
            className="mb-2 text-xs font-bold uppercase tracking-wider"
            style={{ color: onehub.textMuted }}
          >
            Checklist
          </h2>
          <ChecklistRunner
            templateItems={templateItems}
            drafts={drafts}
            savedResponses={savedResponses}
            attachments={attachments}
            issues={issues}
            readOnly={!editable}
            onChange={handleChecklistChange}
            onAddPhoto={(tplItemId) => handleAddPhoto(tplItemId)}
          />
        </section>
      )}

      {/* Notes */}
      <section className="mt-4">
        <h2
          className="mb-2 text-xs font-bold uppercase tracking-wider"
          style={{ color: onehub.textMuted }}
        >
          Notes {item.requires_note && <span style={{ color: onehub.high.fg }}>*</span>}
        </h2>
        <textarea
          value={note}
          disabled={!editable}
          onChange={(e) => {
            setNote(e.target.value);
            setDirty(true);
          }}
          placeholder={
            item.requires_note
              ? "A note is required before completing this task…"
              : "Add a note (optional)…"
          }
          rows={3}
          className="w-full rounded-2xl border bg-white px-3 py-2.5 text-sm disabled:opacity-60"
          style={{ borderColor: onehub.cardBorder, color: onehub.text }}
        />
      </section>

      {/* Photos (work-item level) */}
      <section className="mt-4">
        <h2
          className="mb-2 text-xs font-bold uppercase tracking-wider"
          style={{ color: onehub.textMuted }}
        >
          Photos {item.requires_photo && <span style={{ color: onehub.high.fg }}>*</span>}
        </h2>
        <div className="flex flex-wrap gap-2">
          {itemLevelPhotos.map((photo) => (
            <div key={photo.id} className="relative">
              {photo.url && (
                <img
                  src={photo.url}
                  alt={photo.caption ?? photo.file_name}
                  className="h-20 w-20 rounded-xl object-cover"
                />
              )}
              {editable && (
                <button
                  onClick={() =>
                    removeMutation.mutate({ id: item.id, attachmentId: photo.id })
                  }
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-1 shadow"
                >
                  <Trash2 className="h-3.5 w-3.5" style={{ color: "#c1453e" }} />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button
              onClick={() => handleAddPhoto(null)}
              disabled={uploadMutation.isPending}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs font-medium disabled:opacity-60"
              style={{ borderColor: onehub.cardBorder, color: onehub.textMuted }}
            >
              <Camera className="h-5 w-5" />
              {uploadMutation.isPending ? "Uploading…" : "Add"}
            </button>
          )}
        </div>
      </section>

      {/* History */}
      {(item.events?.length ?? 0) > 0 && (
        <section className="mt-4">
          <h2
            className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider"
            style={{ color: onehub.textMuted }}
          >
            <History className="h-3.5 w-3.5" /> History
          </h2>
          <div
            className="space-y-2 rounded-2xl border p-4"
            style={{ background: onehub.card, borderColor: onehub.cardBorder }}
          >
            {item.events?.map((event) => (
              <div key={event.id} className="text-xs" style={{ color: onehub.textMuted }}>
                <span className="font-semibold" style={{ color: onehub.text }}>
                  {event.event_type.replace(/_/g, " ")}
                </span>{" "}
                — {event.performed_by_user?.name ?? "System"} ·{" "}
                {new Date(event.created_at).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {event.comment && <p className="mt-0.5">{event.comment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sticky action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t px-4 py-3 lg:left-64"
        style={{ background: onehub.canvas, borderColor: onehub.cardBorder }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-xs" style={{ color: onehub.textMuted }}>
            {actionError ? (
              <span style={{ color: "#c1453e" }}>{actionError}</span>
            ) : dirty ? (
              "Unsaved changes…"
            ) : lastSavedAt ? (
              `Last saved at ${new Date(lastSavedAt).toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
              })}`
            ) : editable ? (
              "Changes save automatically"
            ) : item.status === "submitted" || item.status === "completed" ? (
              "This work item is locked."
            ) : (
              ""
            )}
          </div>
          {editable && (
            <button
              onClick={handlePrimaryAction}
              disabled={busy}
              className="flex min-h-[48px] flex-shrink-0 items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: onehub.accent }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {busy ? "Working…" : primaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
