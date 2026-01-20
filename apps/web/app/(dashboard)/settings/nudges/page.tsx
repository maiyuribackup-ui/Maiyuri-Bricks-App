"use client";

/**
 * Nudge Rules Admin UI
 *
 * Allows admins to manage AI nudge rules for automated follow-up reminders.
 * Features:
 * - View all nudge rules
 * - Toggle rules active/inactive
 * - Create new rules
 * - Edit/delete existing rules
 * - Trigger manual digest
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Spinner } from "@maiyuri/ui";
import Link from "next/link";
import type {
  NudgeRule,
  NudgeRuleType,
  CreateNudgeRuleInput,
  LeadStatus,
} from "@maiyuri/shared";

// Fetch nudge rules
async function fetchRules(): Promise<{ data: NudgeRule[] }> {
  const res = await fetch("/api/nudges/rules");
  if (!res.ok) throw new Error("Failed to fetch rules");
  return res.json();
}

// Create a new rule
async function createRule(
  input: CreateNudgeRuleInput,
): Promise<{ data: NudgeRule }> {
  const res = await fetch("/api/nudges/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to create rule");
  }
  return res.json();
}

// Update a rule
async function updateRule(
  id: string,
  input: Partial<NudgeRule>,
): Promise<{ data: NudgeRule }> {
  const res = await fetch(`/api/nudges/rules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to update rule");
  }
  return res.json();
}

// Delete a rule
async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`/api/nudges/rules/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to delete rule");
  }
}

// Trigger digest
async function triggerDigest(): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/nudges/digest", {
    method: "POST",
  });
  return res.json();
}

// Rule type labels
const RULE_TYPE_LABELS: Record<NudgeRuleType, string> = {
  follow_up_overdue: "Follow-up Overdue",
  no_activity: "No Activity",
  high_score_idle: "High Score Idle",
  custom: "Custom",
};

// Rule type colors
const RULE_TYPE_COLORS: Record<NudgeRuleType, string> = {
  follow_up_overdue:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  no_activity:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  high_score_idle:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  custom: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
};

export default function NudgeRulesPage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRule, setEditingRule] = useState<NudgeRule | null>(null);
  const [digestStatus, setDigestStatus] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["nudge-rules"],
    queryFn: fetchRules,
  });

  const rules = data?.data ?? [];

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateRule(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nudge-rules"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nudge-rules"] });
    },
  });

  const digestMutation = useMutation({
    mutationFn: triggerDigest,
    onSuccess: (data) => {
      setDigestStatus(data.message);
      setTimeout(() => setDigestStatus(null), 5000);
    },
    onError: (error) => {
      setDigestStatus(`Error: ${error.message}`);
    },
  });

  const handleToggle = (rule: NudgeRule) => {
    toggleMutation.mutate({ id: rule.id, is_active: !rule.is_active });
  };

  const handleDelete = (rule: NudgeRule) => {
    if (confirm(`Delete rule "${rule.name}"?`)) {
      deleteMutation.mutate(rule.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load nudge rules</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeftIcon className="h-5 w-5 text-slate-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Nudge Rules
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Configure automated follow-up reminders
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => digestMutation.mutate()}
            disabled={digestMutation.isPending}
          >
            {digestMutation.isPending ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <BellIcon className="h-4 w-4 mr-2" />
            )}
            Trigger Digest Now
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            New Rule
          </Button>
        </div>
      </div>

      {/* Digest Status */}
      {digestStatus && (
        <div
          className={`p-4 rounded-lg ${
            digestStatus.startsWith("Error")
              ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
              : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
          }`}
        >
          {digestStatus}
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-4">
        {rules.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-slate-500 dark:text-slate-400">
              No nudge rules configured yet.
            </p>
            <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
              Create your first rule
            </Button>
          </Card>
        ) : (
          rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={handleToggle}
              onEdit={() => setEditingRule(rule)}
              onDelete={handleDelete}
              isToggling={toggleMutation.isPending}
            />
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateForm || editingRule) && (
        <RuleFormModal
          rule={editingRule}
          onClose={() => {
            setShowCreateForm(false);
            setEditingRule(null);
          }}
          onSuccess={() => {
            setShowCreateForm(false);
            setEditingRule(null);
            queryClient.invalidateQueries({ queryKey: ["nudge-rules"] });
          }}
        />
      )}
    </div>
  );
}

// Rule Card Component
function RuleCard({
  rule,
  onToggle,
  onEdit,
  onDelete,
  isToggling,
}: {
  rule: NudgeRule;
  onToggle: (rule: NudgeRule) => void;
  onEdit: () => void;
  onDelete: (rule: NudgeRule) => void;
  isToggling: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-slate-900 dark:text-white">
              {rule.name}
            </h3>
            <span
              className={`px-2 py-0.5 text-xs rounded-full ${
                RULE_TYPE_COLORS[rule.rule_type]
              }`}
            >
              {RULE_TYPE_LABELS[rule.rule_type]}
            </span>
            <span
              className={`px-2 py-0.5 text-xs rounded-full ${
                rule.is_active
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
              }`}
            >
              {rule.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {rule.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {rule.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            {rule.conditions.days_overdue && (
              <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                {rule.conditions.days_overdue}+ days overdue
              </span>
            )}
            {rule.conditions.days_idle && (
              <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                {rule.conditions.days_idle}+ days idle
              </span>
            )}
            {rule.conditions.min_score && (
              <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                Score &gt;= {Math.round(rule.conditions.min_score * 100)}%
              </span>
            )}
            {rule.conditions.statuses &&
              rule.conditions.statuses.length > 0 && (
                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                  {rule.conditions.statuses.join(", ")}
                </span>
              )}
            <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded">
              Priority: {rule.priority}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => onToggle(rule)}
            disabled={isToggling}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              rule.is_active ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                rule.is_active ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <button
            onClick={onEdit}
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(rule)}
            className="p-2 text-slate-500 hover:text-red-600"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

// Rule Form Modal
function RuleFormModal({
  rule,
  onClose,
  onSuccess,
}: {
  rule: NudgeRule | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: rule?.name || "",
    description: rule?.description || "",
    rule_type: rule?.rule_type || ("follow_up_overdue" as NudgeRuleType),
    priority: rule?.priority || 5,
    is_active: rule?.is_active ?? true,
    conditions: {
      days_overdue: rule?.conditions.days_overdue ?? 1,
      days_idle: rule?.conditions.days_idle ?? 3,
      days_since_created: rule?.conditions.days_since_created ?? 2,
      min_score: rule?.conditions.min_score ?? undefined,
      statuses: rule?.conditions.statuses ?? ["hot", "follow_up"],
    },
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createRule,
    onSuccess,
    onError: (err) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: Partial<NudgeRule>) => updateRule(rule!.id, input),
    onSuccess,
    onError: (err) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const input: CreateNudgeRuleInput = {
      name: formData.name,
      description: formData.description || null,
      rule_type: formData.rule_type,
      priority: formData.priority,
      is_active: formData.is_active,
      conditions: formData.conditions,
    };

    if (rule) {
      updateMutation.mutate(input);
    } else {
      createMutation.mutate(input);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
          {rule ? "Edit Rule" : "Create New Rule"}
        </h2>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Rule Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={2}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          {/* Rule Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Rule Type
            </label>
            <select
              value={formData.rule_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  rule_type: e.target.value as NudgeRuleType,
                })
              }
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            >
              <option value="follow_up_overdue">Follow-up Overdue</option>
              <option value="no_activity">No Activity</option>
              <option value="high_score_idle">High Score Idle</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Conditions based on rule type */}
          <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Conditions
            </p>

            {formData.rule_type === "follow_up_overdue" && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Days Overdue
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.conditions.days_overdue ?? 1}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        days_overdue: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-20 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
                />
              </div>
            )}

            {formData.rule_type === "high_score_idle" && (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Minimum Score (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={(formData.conditions.min_score ?? 0.7) * 100}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        conditions: {
                          ...formData.conditions,
                          min_score: parseInt(e.target.value) / 100,
                        },
                      })
                    }
                    className="w-20 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Days Idle
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.conditions.days_idle ?? 3}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        conditions: {
                          ...formData.conditions,
                          days_idle: parseInt(e.target.value),
                        },
                      })
                    }
                    className="w-20 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
                  />
                </div>
              </>
            )}

            {formData.rule_type === "no_activity" && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Days Since Created
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.conditions.days_since_created ?? 2}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      conditions: {
                        ...formData.conditions,
                        days_since_created: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-20 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
                />
              </div>
            )}

            {/* Status filter - common to all */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Apply to statuses
              </label>
              <div className="flex flex-wrap gap-2">
                {(["new", "follow_up", "hot", "cold"] as LeadStatus[]).map(
                  (status) => (
                    <label key={status} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={
                          formData.conditions.statuses?.includes(status) ??
                          false
                        }
                        onChange={(e) => {
                          const statuses = formData.conditions.statuses ?? [];
                          setFormData({
                            ...formData,
                            conditions: {
                              ...formData.conditions,
                              statuses: e.target.checked
                                ? [...statuses, status]
                                : statuses.filter((s) => s !== status),
                            },
                          });
                        }}
                        className="rounded border-slate-300"
                      />
                      <span className="text-xs capitalize">
                        {status.replace("_", " ")}
                      </span>
                    </label>
                  ),
                )}
              </div>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Priority (0-100, higher = checked first)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={formData.priority}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  priority: parseInt(e.target.value),
                })
              }
              className="w-20 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          {/* Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="rounded border-slate-300"
            />
            <label
              htmlFor="is_active"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              Active (rule will be evaluated in daily digest)
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : rule ? (
                "Update Rule"
              ) : (
                "Create Rule"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// Icons
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
