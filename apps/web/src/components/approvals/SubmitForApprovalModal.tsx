"use client";

import { useState } from "react";
import type { TicketPriority } from "@maiyuri/shared";
import { TicketPriorityBadge } from "./TicketPriorityBadge";

interface SubmitForApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    priority: TicketPriority;
    notes?: string;
    due_date?: string;
  }) => void;
  isLoading?: boolean;
  orderNumber: string;
}

const priorityOptions: { value: TicketPriority; description: string }[] = [
  { value: "low", description: "Can wait, no urgency" },
  { value: "medium", description: "Normal priority" },
  { value: "high", description: "Needs attention soon" },
  { value: "urgent", description: "Immediate approval needed" },
];

export function SubmitForApprovalModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
  orderNumber,
}: SubmitForApprovalModalProps) {
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");

  const handleSubmit = () => {
    onSubmit({
      priority,
      notes: notes.trim() || undefined,
      due_date: dueDate || undefined,
    });
  };

  const handleClose = () => {
    setPriority("medium");
    setNotes("");
    setDueDate("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <svg
              className="h-6 w-6 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          {/* Content */}
          <div className="mt-4 text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Submit for Approval
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Submit order <span className="font-medium">{orderNumber}</span>{" "}
              for approval. An approval ticket will be created for reviewers.
            </p>
          </div>

          {/* Priority Selection */}
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Priority
            </label>
            <div className="space-y-2">
              {priorityOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${
                    priority === option.value
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={option.value}
                    checked={priority === option.value}
                    onChange={() => setPriority(option.value)}
                    className="sr-only"
                  />
                  <TicketPriorityBadge priority={option.value} size="sm" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {option.description}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Due Date (Optional)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          {/* Notes */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes for the approver..."
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Submitting...
                </span>
              ) : (
                "Submit for Approval"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
