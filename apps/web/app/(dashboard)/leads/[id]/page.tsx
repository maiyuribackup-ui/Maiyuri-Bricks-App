"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, Button, Badge, Spinner, Modal } from "@maiyuri/ui";
import {
  createNoteSchema,
  type CreateNoteInput,
  type Lead,
  type Note,
  type LeadStatus,
  type LeadStage,
  type CallRecording,
} from "@maiyuri/shared";
import {
  AudioUpload,
  WhatsAppButton,
  SmartQuoteCard,
  UnifiedAIInsights,
} from "@/components/leads";
import { LeadActivityTimeline } from "@/components/timeline";
import { PriceEstimatorPanel } from "@/components/estimates";
import { HelpButton } from "@/components/help";
import {
  ArrowTopRightOnSquareIcon,
  BellAlertIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Toaster, toast } from "sonner";

const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  follow_up: "Follow Up",
  hot: "Hot",
  cold: "Cold",
  converted: "Converted",
  lost: "Lost",
};

const statusOptions: LeadStatus[] = [
  "new",
  "follow_up",
  "hot",
  "cold",
  "converted",
  "lost",
];

// Stage configuration with labels and icons (Issue #19)
const stageConfig: Record<
  LeadStage,
  { label: string; icon: string; color: string }
> = {
  inquiry: {
    label: "Inquiry",
    icon: "💬",
    color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  },
  quote_sent: {
    label: "Quote Sent",
    icon: "📧",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  factory_visit: {
    label: "Factory Visit",
    icon: "🏭",
    color:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  negotiation: {
    label: "Negotiation",
    icon: "🤝",
    color:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  order_confirmed: {
    label: "Order Confirmed",
    icon: "✅",
    color:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  in_production: {
    label: "In Production",
    icon: "⚙️",
    color:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  ready_dispatch: {
    label: "Ready for Dispatch",
    icon: "📦",
    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  },
  delivered: {
    label: "Delivered",
    icon: "🚚",
    color:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
};

const stageOptions: LeadStage[] = [
  "inquiry",
  "quote_sent",
  "factory_visit",
  "negotiation",
  "order_confirmed",
  "in_production",
  "ready_dispatch",
  "delivered",
];

async function fetchLead(id: string) {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error("Failed to fetch lead");
  return res.json();
}

async function fetchNotes(leadId: string) {
  const res = await fetch(`/api/leads/${leadId}/notes`);
  if (!res.ok) throw new Error("Failed to fetch notes");
  return res.json();
}

async function fetchCallRecordings(leadId: string) {
  const res = await fetch(`/api/leads/${leadId}/call-recordings`);
  if (!res.ok) throw new Error("Failed to fetch call recordings");
  return res.json();
}

async function updateLeadStatus(id: string, status: LeadStatus) {
  const res = await fetch(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

async function updateLeadStage(id: string, stage: LeadStage) {
  const res = await fetch(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage,
      stage_updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error("Failed to update stage");
  return res.json();
}

async function deleteLead(id: string) {
  const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete lead");
  return res.json();
}

async function syncLeadWithOdoo(
  leadId: string,
  action: "push" | "pull" | "both" = "both",
) {
  const res = await fetch(`/api/odoo/sync/${leadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error("Sync failed");
  return res.json();
}

async function triggerNudge(leadId: string, message?: string) {
  const res = await fetch("/api/nudges/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lead_id: leadId,
      nudge_type: "manual",
      message,
    }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to send nudge");
  }
  return res.json();
}

async function createNote(leadId: string, data: CreateNoteInput) {
  const res = await fetch(`/api/leads/${leadId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, lead_id: leadId }),
  });
  if (!res.ok) throw new Error("Failed to create note");
  return res.json();
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const leadId = params.id as string;
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showAudioUpload, setShowAudioUpload] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEstimator, setShowEstimator] = useState(false);
  // Issue #20: Quick status/stage dropdowns
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showStageDropdown, setShowStageDropdown] = useState(false);

  const { data: leadData, isLoading: leadLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => fetchLead(leadId),
  });

  const { data: notesData, isLoading: notesLoading } = useQuery({
    queryKey: ["notes", leadId],
    queryFn: () => fetchNotes(leadId),
  });

  const { data: callRecordingsData, isLoading: callRecordingsLoading } =
    useQuery({
      queryKey: ["callRecordings", leadId],
      queryFn: () => fetchCallRecordings(leadId),
    });

  const lead: Lead | null = leadData?.data;
  const notes: Note[] = notesData?.data || [];
  const callRecordings: CallRecording[] = callRecordingsData?.data || [];

  const statusMutation = useMutation({
    mutationFn: (status: LeadStatus) => updateLeadStatus(leadId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const stageMutation = useMutation({
    mutationFn: (stage: LeadStage) => updateLeadStage(leadId, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Stage updated successfully");
    },
    onError: () => {
      toast.error("Failed to update stage");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      router.push("/leads");
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateNoteInput>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: { lead_id: leadId },
  });

  const noteMutation = useMutation({
    mutationFn: (data: CreateNoteInput) => createNote(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", leadId] });
      reset();
      setShowNoteForm(false);
    },
  });

  // Odoo Sync Mutation
  const odooSyncMutation = useMutation({
    mutationFn: (action: "push" | "pull" | "both") =>
      syncLeadWithOdoo(leadId, action),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      const pushResult = data.results?.push;
      const pullResult = data.results?.pull;
      let message = "Sync completed: ";
      if (pushResult?.success) message += pushResult.message + " ";
      if (pullResult?.success) message += pullResult.message;
      toast.success(message.trim());
    },
    onError: (error) => {
      toast.error(
        `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // Manual Nudge Mutation (Issue #27)
  const nudgeMutation = useMutation({
    mutationFn: () => triggerNudge(leadId),
    onSuccess: (data) => {
      toast.success(
        `Nudge sent for ${data.data?.lead_name ?? "lead"} to ${data.data?.sent_to === "assigned_staff" ? "assigned staff" : "main channel"}`,
      );
    },
    onError: (error) => {
      toast.error(
        `Failed to send nudge: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  if (leadLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Lead not found</p>
        <Link href="/leads" className="mt-4 text-blue-600 hover:text-blue-500">
          Back to leads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      {/* Help Button */}
      <div className="flex justify-end">
        <HelpButton section="lead-detail" variant="icon" />
      </div>

      {/* Enhanced Header Card - Issue #8 */}
      <Card className="p-0 overflow-hidden">
        {/* Status Color Bar */}
        <div className={`h-2 ${getStatusColor(lead.status)}`} />

        <div className="p-6">
          {/* Top Row: Back, Name, Actions */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div className="flex items-start gap-4">
              <Link
                href="/leads"
                className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 mt-1"
              >
                <ArrowLeftIcon className="h-5 w-5 text-slate-500" />
              </Link>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {lead.name}
                  </h1>
                  {/* Issue #20: Clickable Status Badge with Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowStatusDropdown(!showStatusDropdown);
                        setShowStageDropdown(false);
                      }}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 transition-all ${
                        lead.status === "hot"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          : lead.status === "converted"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : lead.status === "follow_up"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {statusLabels[lead.status]}
                      <ChevronDownIcon className="h-3 w-3" />
                    </button>
                    {showStatusDropdown && (
                      <div className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                        {statusOptions.map((status) => (
                          <button
                            key={status}
                            onClick={() => {
                              statusMutation.mutate(status);
                              setShowStatusDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between ${
                              lead.status === status
                                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {statusLabels[status]}
                            {lead.status === status && (
                              <span className="text-blue-600">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Issue #20: Clickable Stage Badge with Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowStageDropdown(!showStageDropdown);
                        setShowStatusDropdown(false);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 transition-all ${
                        lead.stage
                          ? stageConfig[lead.stage].color
                          : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                      }`}
                    >
                      <span>
                        {lead.stage ? stageConfig[lead.stage].icon : "📋"}
                      </span>
                      <span>
                        {lead.stage
                          ? stageConfig[lead.stage].label
                          : "Set Stage"}
                      </span>
                      <ChevronDownIcon className="h-3 w-3" />
                    </button>
                    {showStageDropdown && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50 max-h-72 overflow-y-auto">
                        {stageOptions.map((stage) => {
                          const config = stageConfig[stage];
                          return (
                            <button
                              key={stage}
                              onClick={() => {
                                stageMutation.mutate(stage);
                                setShowStageDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 ${
                                lead.stage === stage
                                  ? "bg-blue-50 dark:bg-blue-900/20"
                                  : ""
                              }`}
                            >
                              <span>{config.icon}</span>
                              <span
                                className={
                                  lead.stage === stage
                                    ? "text-blue-700 dark:text-blue-300"
                                    : "text-slate-700 dark:text-slate-300"
                                }
                              >
                                {config.label}
                              </span>
                              {lead.stage === stage && (
                                <span className="ml-auto text-blue-600">✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <PhoneIcon className="h-4 w-4 inline mr-1" />
                  {lead.contact} • {lead.source} • {lead.lead_type}
                </p>
              </div>
            </div>
            <div className="flex gap-2 ml-11 sm:ml-0">
              <Link href={`/leads/${leadId}/edit`}>
                <Button variant="secondary" size="sm">
                  <EditIcon className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </Link>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteModal(true)}
              >
                <TrashIcon className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>

          {/* Key Metrics Row - 3 columns (AI Score removed - shown in Decision Cockpit below) */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            {/* Status */}
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Status
              </div>
              <div
                className={`text-lg font-semibold ${getStatusTextColor(lead.status)}`}
              >
                {statusLabels[lead.status]}
              </div>
              {lead.urgency && (
                <div className="text-xs text-slate-500 mt-1">
                  {formatUrgency(lead.urgency)}
                </div>
              )}
            </div>

            {/* Next Action */}
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Next Action
              </div>
              <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {lead.next_action || "—"}
              </div>
              {lead.follow_up_date && (
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  📅{" "}
                  {new Date(lead.follow_up_date).toLocaleDateString("en-IN", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              )}
            </div>

            {/* Quote/Order Value */}
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                {lead.odoo_order_amount ? "Order Value" : "Quote Value"}
              </div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {lead.odoo_order_amount
                  ? `₹${(lead.odoo_order_amount ?? 0).toLocaleString("en-IN")}`
                  : lead.odoo_quote_amount
                    ? `₹${(lead.odoo_quote_amount ?? 0).toLocaleString("en-IN")}`
                    : "—"}
              </div>
              {(lead.odoo_quote_number || lead.odoo_order_number) && (
                <div className="text-xs text-slate-500 mt-1">
                  {lead.odoo_order_number || lead.odoo_quote_number}
                </div>
              )}
            </div>
          </div>

          {/* Classification & Location Row */}
          {(lead.classification ||
            lead.requirement_type ||
            lead.site_region ||
            (lead.product_interests && lead.product_interests.length > 0)) && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              {lead.classification && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {formatClassification(lead.classification)}
                </span>
              )}
              {lead.requirement_type && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                  {formatRequirementType(lead.requirement_type)}
                </span>
              )}
              {/* Product Interests - Multi-select display */}
              {lead.product_interests && lead.product_interests.length > 0 && (
                <>
                  {lead.product_interests.map((interest) => (
                    <span
                      key={interest}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                    >
                      🧱 {formatProductInterest(interest)}
                    </span>
                  ))}
                </>
              )}
              {(lead.site_region || lead.site_location) && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                  📍{" "}
                  {[lead.site_location, lead.site_region]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Unified AI Insights - Issue #24 */}
      <UnifiedAIInsights
        lead={lead}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Audio Upload Section (shown above timeline) */}
          {showAudioUpload && (
            <Card className="p-4 bg-slate-50 dark:bg-slate-800">
              <AudioUpload
                leadId={leadId}
                onTranscriptionComplete={async (transcription) => {
                  // Create a note with the transcription
                  await noteMutation.mutateAsync({
                    text: transcription.text,
                    lead_id: leadId,
                  });
                  setShowAudioUpload(false);
                }}
                onError={(error) => {
                  console.error("Audio upload error:", error);
                }}
              />
            </Card>
          )}

          {/* Add Note Form (shown above timeline) */}
          {showNoteForm && (
            <Card className="p-4 bg-slate-50 dark:bg-slate-800">
              <form
                onSubmit={handleSubmit((data) => noteMutation.mutate(data))}
              >
                <textarea
                  {...register("text")}
                  rows={4}
                  placeholder="Enter note..."
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.text && (
                  <p className="mt-1 text-sm text-red-500">
                    {errors.text.message}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button type="submit" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Note"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Unified Lead Activity Timeline */}
          <LeadActivityTimeline
            notes={notes}
            callRecordings={callRecordings}
            leadId={leadId}
            loading={notesLoading || callRecordingsLoading}
            onAddNote={() => {
              setShowNoteForm(!showNoteForm);
              setShowAudioUpload(false);
            }}
            onAddAudio={() => {
              setShowAudioUpload(!showAudioUpload);
              setShowNoteForm(false);
            }}
            showNoteForm={showNoteForm}
            showAudioUpload={showAudioUpload}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <Card className="p-4">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Quick Actions
            </h3>
            <div className="space-y-3">
              {/* WhatsApp Button */}
              <div>
                <WhatsAppButton leadId={leadId} contactNumber={lead.contact} />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-center">
                  Generate AI-powered response for WhatsApp
                </p>
              </div>

              {/* Create Estimate Button */}
              <div>
                <Button
                  className="w-full"
                  onClick={() => setShowEstimator(true)}
                >
                  <CalculatorIcon className="h-4 w-4 mr-2" />
                  Create Estimate
                </Button>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-center">
                  Generate price estimate with AI discount suggestions
                </p>
              </div>

              {/* Send Nudge Button (Issue #27) */}
              <div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => nudgeMutation.mutate()}
                  disabled={nudgeMutation.isPending}
                >
                  <BellAlertIcon className="h-4 w-4 mr-2" />
                  {nudgeMutation.isPending ? "Sending..." : "Send Nudge"}
                </Button>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 text-center">
                  Send reminder to assigned staff via Telegram
                </p>
              </div>
            </div>
          </Card>

          {/* Smart Quote Card */}
          <SmartQuoteCard
            lead={lead}
            hasTranscripts={callRecordings.some((r) => r.transcription_text)}
          />

          {/* Odoo Sync Card */}
          <Card className="p-4">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <OdooIcon className="h-4 w-4" />
              Odoo CRM Sync
            </h3>
            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => odooSyncMutation.mutate("both")}
                disabled={odooSyncMutation.isPending}
              >
                {odooSyncMutation.isPending ? "Syncing..." : "Sync Now"}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => odooSyncMutation.mutate("push")}
                  disabled={odooSyncMutation.isPending}
                >
                  Push to Odoo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => odooSyncMutation.mutate("pull")}
                  disabled={odooSyncMutation.isPending}
                >
                  Pull Quotes
                </Button>
              </div>
            </div>
            {lead.odoo_lead_id && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Odoo ID</dt>
                    <dd className="font-medium text-slate-900 dark:text-white">
                      #{lead.odoo_lead_id}
                    </dd>
                  </div>
                </dl>

                {/* Enhanced Quote Display */}
                {lead.odoo_quote_number && (
                  <div className="mb-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Quotation
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="success"
                          className="text-emerald-700 dark:text-emerald-300"
                        >
                          {lead.odoo_quote_number}
                        </Badge>
                        {lead.odoo_quote_id && (
                          <a
                            href={`https://CRM.MAIYURI.COM/web#id=${lead.odoo_quote_id}&model=sale.order&view_type=form`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200"
                            title="Open in Odoo"
                          >
                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    {lead.odoo_quote_amount && (
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                          ₹
                          {lead.odoo_quote_amount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    )}

                    {lead.odoo_quote_date && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        Created:{" "}
                        {new Date(lead.odoo_quote_date).toLocaleDateString(
                          "en-IN",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </p>
                    )}
                  </div>
                )}

                {/* Enhanced Order Display */}
                {lead.odoo_order_number && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        Confirmed Order
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="default"
                          className="text-blue-700 dark:text-blue-300"
                        >
                          {lead.odoo_order_number}
                        </Badge>
                        {lead.odoo_order_id && (
                          <a
                            href={`https://CRM.MAIYURI.COM/web#id=${lead.odoo_order_id}&model=sale.order&view_type=form`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                            title="Open in Odoo"
                          >
                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    {lead.odoo_order_amount && (
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                          ₹
                          {lead.odoo_order_amount.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    )}

                    {lead.odoo_order_date && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Confirmed:{" "}
                        {new Date(lead.odoo_order_date).toLocaleDateString(
                          "en-IN",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </p>
                    )}
                  </div>
                )}

                <dl className="space-y-1 text-xs mt-3">
                  {lead.odoo_synced_at && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Last Sync</dt>
                      <dd className="text-slate-600 dark:text-slate-400">
                        {new Date(lead.odoo_synced_at).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
            {!lead.odoo_lead_id && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
                Not yet synced with Odoo
              </p>
            )}
          </Card>

          {/* Status Card */}
          <Card className="p-6">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Update Status
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  onClick={() => statusMutation.mutate(status)}
                  disabled={statusMutation.isPending}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                    lead.status === status
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                  }`}
                >
                  {statusLabels[status]}
                </button>
              ))}
            </div>
          </Card>

          {/* Stage Card - Issue #19 */}
          <Card className="p-6">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Pipeline Stage
            </h3>
            <div className="space-y-2">
              {stageOptions.map((stage) => {
                const config = stageConfig[stage];
                const isActive = lead.stage === stage;
                return (
                  <button
                    key={stage}
                    onClick={() => stageMutation.mutate(stage)}
                    disabled={stageMutation.isPending}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? "ring-2 ring-blue-500 " + config.color
                        : config.color + " opacity-60 hover:opacity-100"
                    }`}
                  >
                    <span className="text-base">{config.icon}</span>
                    <span>{config.label}</span>
                    {isActive && (
                      <span className="ml-auto text-blue-600 dark:text-blue-400">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {lead.stage_updated_at && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Last updated:{" "}
                {new Date(lead.stage_updated_at).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </Card>

          {/* Staff Notes Card */}
          {lead.staff_notes && (
            <Card className="p-6">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Staff Notes
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 p-3 rounded-md">
                {lead.staff_notes}
              </p>
            </Card>
          )}

          {/* Details Card */}
          <Card className="p-6">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Details
            </h3>
            <dl className="space-y-3 text-sm">
              {lead.next_action && (
                <div>
                  <dt className="text-slate-500">Next Action</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {lead.next_action}
                  </dd>
                </div>
              )}
              {lead.follow_up_date && (
                <div>
                  <dt className="text-slate-500">Follow-up Date</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {new Date(lead.follow_up_date).toLocaleDateString()}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {new Date(lead.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Lead"
        size="sm"
      >
        <p className="text-slate-600 dark:text-slate-300">
          Are you sure you want to delete <strong>{lead.name}</strong>? This
          action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </Modal>

      {/* Price Estimator Panel */}
      <PriceEstimatorPanel
        lead={lead}
        isOpen={showEstimator}
        onClose={() => setShowEstimator(false)}
        onEstimateCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["estimates", leadId] });
        }}
      />
    </div>
  );
}

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

// Issue #20: Chevron icon for dropdowns
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
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
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
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

function CalculatorIcon({ className }: { className?: string }) {
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
        d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z"
      />
    </svg>
  );
}

function OdooIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
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
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
      />
    </svg>
  );
}

// Helper functions for Issue #8 - Enhanced Header Layout
function getStatusColor(status: string): string {
  switch (status) {
    case "hot":
      return "bg-red-500";
    case "converted":
      return "bg-emerald-500";
    case "follow_up":
      return "bg-amber-500";
    case "new":
      return "bg-blue-500";
    case "cold":
      return "bg-slate-400";
    case "lost":
      return "bg-slate-600";
    default:
      return "bg-slate-400";
  }
}

function getStatusTextColor(status: string): string {
  switch (status) {
    case "hot":
      return "text-red-600 dark:text-red-400";
    case "converted":
      return "text-emerald-600 dark:text-emerald-400";
    case "follow_up":
      return "text-amber-600 dark:text-amber-400";
    case "new":
      return "text-blue-600 dark:text-blue-400";
    case "cold":
      return "text-slate-500 dark:text-slate-400";
    case "lost":
      return "text-slate-600 dark:text-slate-500";
    default:
      return "text-slate-600 dark:text-slate-400";
  }
}

function getScoreColor(score: number | null | undefined): string {
  if (score == null) return "text-slate-400";
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreLabel(score: number): string {
  if (score >= 70) return "High Potential";
  if (score >= 40) return "Medium";
  return "Low Priority";
}

function formatUrgency(urgency: string): string {
  switch (urgency) {
    case "immediate":
      return "🔥 Immediate";
    case "1-3_months":
      return "📅 1-3 Months";
    case "3-6_months":
      return "🗓️ 3-6 Months";
    default:
      return "❓ Unknown";
  }
}

function formatClassification(classification: string): string {
  switch (classification) {
    case "direct_customer":
      return "👤 Direct Customer";
    case "vendor":
      return "🏭 Vendor";
    case "builder":
      return "🏗️ Builder";
    case "dealer":
      return "🤝 Dealer";
    case "architect":
      return "📐 Architect";
    default:
      return classification;
  }
}

function formatRequirementType(requirementType: string): string {
  switch (requirementType) {
    case "residential_house":
      return "🏠 Residential House";
    case "commercial_building":
      return "🏢 Commercial Building";
    case "eco_friendly_building":
      return "🌿 Eco-Friendly Building";
    case "compound_wall":
      return "🧱 Compound Wall";
    default:
      return requirementType;
  }
}

function formatProductInterest(interest: string): string {
  switch (interest) {
    case "8_inch_mud_interlock":
      return '8" Mud Interlock';
    case "6_inch_mud_interlock":
      return '6" Mud Interlock';
    case "8_inch_cement_interlock":
      return '8" Cement Interlock';
    case "6_inch_cement_interlock":
      return '6" Cement Interlock';
    case "compound_wall_project":
      return "Compound Wall Project";
    case "residential_project":
      return "Residential Project";
    case "laying_services":
      return "Laying Services";
    default:
      return interest;
  }
}
