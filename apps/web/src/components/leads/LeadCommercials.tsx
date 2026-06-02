"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button } from "@maiyuri/ui";
import { toast } from "sonner";
import type { Lead } from "@maiyuri/shared";

interface LeadCommercialsProps {
  lead: Lead;
}

const inr = (n: number | null | undefined) =>
  n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN");

/**
 * Editable "Commercials" card — captures the real deal value & area that power
 * the dashboard revenue / pipeline-value KPIs and the geographic view.
 * Replaces the previous fabricated figures with staff-entered truth.
 */
export function LeadCommercials({ lead }: LeadCommercialsProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const [estimatedValue, setEstimatedValue] = useState(
    lead.estimated_value != null ? String(lead.estimated_value) : "",
  );
  const [estimatedQuantity, setEstimatedQuantity] = useState(
    lead.estimated_quantity != null ? String(lead.estimated_quantity) : "",
  );
  const [finalOrderValue, setFinalOrderValue] = useState(
    lead.final_order_value != null ? String(lead.final_order_value) : "",
  );
  const [area, setArea] = useState(lead.area ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimated_value: estimatedValue,
          estimated_quantity: estimatedQuantity,
          final_order_value: finalOrderValue,
          area,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Commercials updated");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-analytics"] });
    },
    onError: () => toast.error("Could not save commercials"),
  });

  const isWon = lead.pipeline_stage === "order_won";

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          💰 Commercials
        </h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Estimated value (₹)
            </span>
            <input
              type="number"
              min={0}
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Estimated quantity
            </span>
            <input
              type="number"
              min={0}
              value={estimatedQuantity}
              onChange={(e) => setEstimatedQuantity(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Final order value (₹){" "}
              {!isWon && (
                <span className="text-slate-400">— set when won</span>
              )}
            </span>
            <input
              type="number"
              min={0}
              value={finalOrderValue}
              onChange={(e) => setFinalOrderValue(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Area / locality
            </span>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. Redhills, Chennai"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={save.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              Estimated value
            </dt>
            <dd className="font-semibold text-slate-900 dark:text-slate-100">
              {inr(lead.estimated_value)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              Estimated qty
            </dt>
            <dd className="font-semibold text-slate-900 dark:text-slate-100">
              {lead.estimated_quantity != null
                ? lead.estimated_quantity.toLocaleString("en-IN")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">
              Final order value
            </dt>
            <dd className="font-semibold text-emerald-600 dark:text-emerald-400">
              {inr(lead.final_order_value)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Area</dt>
            <dd className="font-semibold text-slate-900 dark:text-slate-100">
              {lead.area || "—"}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
