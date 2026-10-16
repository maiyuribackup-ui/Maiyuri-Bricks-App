"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useChecklistTemplates, useCreateWorkItem } from "@/hooks/useMyWork";
import { onehub } from "@/lib/onehub-theme";
import type { WorkActivityType, WorkPriority } from "@maiyuri/shared";

interface StaffUser {
  id: string;
  name: string;
  role: string;
}

interface CreateWorkItemDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateWorkItemDialog({ open, onClose }: CreateWorkItemDialogProps) {
  const createMutation = useCreateWorkItem();
  const { data: templatesData } = useChecklistTemplates(open);
  const templates = templatesData?.data ?? [];

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [activityType, setActivityType] = useState<WorkActivityType>("simple");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<WorkPriority>("medium");
  const [relatedLabel, setRelatedLabel] = useState("");
  const [checklistTemplateId, setChecklistTemplateId] = useState("");
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [requiresNote, setRequiresNote] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/users")
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body) => setUsers(body.data ?? []))
      .catch(() => setUsers([]));
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setInstructions("");
    setActivityType("simple");
    setAssignee("");
    setDueDate("");
    setDueTime("");
    setPriority("medium");
    setRelatedLabel("");
    setChecklistTemplateId("");
    setRequiresPhoto(false);
    setRequiresNote(false);
    setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!title.trim()) return setFormError("Title is required.");
    if (!assignee) return setFormError("Please choose who this is assigned to.");
    if (activityType === "checklist" && !checklistTemplateId) {
      return setFormError("Please choose a checklist template.");
    }

    let dueAt: string | null = null;
    if (dueDate) {
      dueAt = new Date(`${dueDate}T${dueTime || "18:00"}:00`).toISOString();
    }

    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        instructions: instructions.trim() || null,
        activity_type: activityType,
        priority,
        assigned_user_id: assignee,
        due_at: dueAt,
        related_label: relatedLabel.trim() || null,
        checklist_template_id:
          activityType === "checklist" ? checklistTemplateId : null,
        requires_photo: requiresPhoto,
        requires_note: requiresNote,
        requires_approval: false,
      });
      reset();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    }
  };

  const inputStyle = { borderColor: onehub.cardBorder, color: onehub.text };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ background: onehub.canvas }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold" style={{ color: onehub.brand }}>
            Assign Work
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5">
            <X className="h-5 w-5" style={{ color: onehub.textMuted }} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done? e.g. Pan Mixer Inspection"
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
            style={inputStyle}
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as WorkActivityType)}
              className="rounded-xl border bg-white px-3 py-2.5 text-sm"
              style={inputStyle}
            >
              <option value="simple">Simple Task</option>
              <option value="checklist">Checklist Task</option>
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as WorkPriority)}
              className="rounded-xl border bg-white px-3 py-2.5 text-sm"
              style={inputStyle}
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {activityType === "checklist" && (
            <select
              value={checklistTemplateId}
              onChange={(e) => setChecklistTemplateId(e.target.value)}
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
              style={inputStyle}
            >
              <option value="">Choose checklist template…</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.items?.length ?? 0} items)
                </option>
              ))}
            </select>
          )}

          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
            style={inputStyle}
          >
            <option value="">Assign to…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-xl border bg-white px-3 py-2.5 text-sm"
              style={inputStyle}
            />
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="rounded-xl border bg-white px-3 py-2.5 text-sm"
              style={inputStyle}
            />
          </div>

          <input
            value={relatedLabel}
            onChange={(e) => setRelatedLabel(e.target.value)}
            placeholder="Machine / vehicle / site (optional), e.g. Pan Mixer 01"
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
            style={inputStyle}
          />

          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instructions (optional)"
            rows={2}
            className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
            style={inputStyle}
          />

          <div className="flex gap-4">
            <label
              className="flex min-h-[44px] items-center gap-2 text-sm"
              style={{ color: onehub.text }}
            >
              <input
                type="checkbox"
                checked={requiresPhoto}
                onChange={(e) => setRequiresPhoto(e.target.checked)}
              />
              Photo required
            </label>
            <label
              className="flex min-h-[44px] items-center gap-2 text-sm"
              style={{ color: onehub.text }}
            >
              <input
                type="checkbox"
                checked={requiresNote}
                onChange={(e) => setRequiresNote(e.target.checked)}
              />
              Note required
            </label>
          </div>

          {formError && (
            <p className="text-sm font-medium" style={{ color: "#c1453e" }}>
              {formError}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: onehub.accent }}
          >
            {createMutation.isPending ? "Assigning…" : "Assign Work"}
          </button>
        </div>
      </div>
    </div>
  );
}
