"use client";

import { useState } from "react";
import type { Ticket } from "@maiyuri/shared";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketTimeline } from "./TicketTimeline";
import { ApprovalConfirmationModal } from "./ApprovalConfirmationModal";
import { RejectionModal } from "./RejectionModal";
import {
  useTicketHistory,
  useApproveTicket,
  useRejectTicket,
  useRequestChanges,
  useAddComment,
} from "@/hooks/useTickets";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";

interface TicketDetailPanelProps {
  ticket: Ticket;
  isOpen: boolean;
  onClose: () => void;
  onActionComplete?: () => void;
}

export function TicketDetailPanel({
  ticket,
  isOpen,
  onClose,
  onActionComplete,
}: TicketDetailPanelProps) {
  const { user } = useAuthStore();
  const { data: historyData, isLoading: historyLoading } = useTicketHistory(
    ticket.id,
  );
  const approveMutation = useApproveTicket();
  const rejectMutation = useRejectTicket();
  const requestChangesMutation = useRequestChanges();
  const addCommentMutation = useAddComment();

  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showRequestChangesModal, setShowRequestChangesModal] = useState(false);
  const [comment, setComment] = useState("");

  const history = historyData?.data ?? [];

  // Check if user can approve (engineer, accountant, owner, founder)
  const canApprove = ["engineer", "accountant", "owner", "founder"].includes(
    user?.role ?? "",
  );
  const isPending =
    ticket.status === "pending" || ticket.status === "in_review";

  const handleApprove = async (notes?: string) => {
    try {
      await approveMutation.mutateAsync({
        ticketId: ticket.id,
        data: notes ? { notes } : undefined,
      });
      setShowApproveModal(false);
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to approve ticket:", error);
    }
  };

  const handleReject = async (reason: string) => {
    try {
      await rejectMutation.mutateAsync({
        ticketId: ticket.id,
        data: { reason },
      });
      setShowRejectModal(false);
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to reject ticket:", error);
    }
  };

  const handleRequestChanges = async (changes: string) => {
    try {
      await requestChangesMutation.mutateAsync({
        ticketId: ticket.id,
        data: { reason: changes },
      });
      setShowRequestChangesModal(false);
      onActionComplete?.();
    } catch (error) {
      console.error("Failed to request changes:", error);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    try {
      await addCommentMutation.mutateAsync({
        ticketId: ticket.id,
        data: { comment },
      });
      setComment("");
    } catch (error) {
      console.error("Failed to add comment:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto bg-white shadow-xl dark:bg-gray-900 sm:max-w-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {ticket.ticket_number}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {ticket.type.replace("_", " ")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Title and Description */}
          <div className="mb-6">
            <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100">
              {ticket.title}
            </h3>
            {ticket.description && (
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                {ticket.description}
              </p>
            )}
          </div>

          {/* Status and Priority */}
          <div className="mb-6 flex flex-wrap gap-3">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>

          {/* Details Grid */}
          <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Created
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {format(new Date(ticket.created_at), "PPp")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                Due Date
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {ticket.due_date
                  ? format(new Date(ticket.due_date), "PP")
                  : "-"}
              </dd>
            </div>
            {ticket.created_by_user && (
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Created By
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {ticket.created_by_user.full_name}
                </dd>
              </div>
            )}
            {ticket.resolved_at && (
              <div>
                <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Resolved
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {format(new Date(ticket.resolved_at), "PPp")}
                </dd>
              </div>
            )}
          </div>

          {/* Approval/Rejection Notes */}
          {ticket.approval_notes && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-900/20">
              <h4 className="text-sm font-medium text-green-800 dark:text-green-400">
                Approval Notes
              </h4>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                {ticket.approval_notes}
              </p>
            </div>
          )}
          {ticket.rejection_reason && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
              <h4 className="text-sm font-medium text-red-800 dark:text-red-400">
                Rejection Reason
              </h4>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {ticket.rejection_reason}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          {canApprove && isPending && (
            <div className="mb-6 flex flex-wrap gap-3">
              <button
                onClick={() => setShowApproveModal(true)}
                disabled={approveMutation.isPending}
                className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setShowRequestChangesModal(true)}
                disabled={requestChangesMutation.isPending}
                className="flex-1 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                Request Changes
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={rejectMutation.isPending}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}

          {/* Add Comment */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Add Comment
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800"
              />
              <button
                onClick={handleAddComment}
                disabled={!comment.trim() || addCommentMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="mb-4 text-sm font-medium text-gray-700 dark:text-gray-300">
              Activity History
            </h4>
            <TicketTimeline history={history} isLoading={historyLoading} />
          </div>
        </div>
      </div>

      {/* Modals */}
      <ApprovalConfirmationModal
        isOpen={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        onConfirm={handleApprove}
        isLoading={approveMutation.isPending}
        ticketNumber={ticket.ticket_number}
      />

      <RejectionModal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={handleReject}
        isLoading={rejectMutation.isPending}
        ticketNumber={ticket.ticket_number}
        title="Reject Ticket"
        label="Rejection Reason"
        placeholder="Enter reason for rejection..."
      />

      <RejectionModal
        isOpen={showRequestChangesModal}
        onClose={() => setShowRequestChangesModal(false)}
        onConfirm={handleRequestChanges}
        isLoading={requestChangesMutation.isPending}
        ticketNumber={ticket.ticket_number}
        title="Request Changes"
        label="Changes Required"
        placeholder="Describe the changes needed..."
      />
    </>
  );
}
