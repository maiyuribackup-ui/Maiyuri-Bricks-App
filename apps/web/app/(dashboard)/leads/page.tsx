"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Spinner } from "@maiyuri/ui";
import { LeadsKanban } from "./LeadsKanban";
import Link from "next/link";
import { buildWhatsAppUrl, type Lead, type LeadStatus } from "@maiyuri/shared";
import { Toaster, toast } from "sonner";
import {
  ArchiveSuggestionsPanel,
  ArchiveConfigPanel,
} from "@/components/archive";
import { useArchiveSuggestions } from "@/hooks/useArchive";

// Odoo sync function
async function syncAllWithOdoo(type: "full" | "push" | "pull" = "full") {
  const res = await fetch("/api/odoo/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
  if (!res.ok) throw new Error("Sync failed");
  return res.json();
}

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const statusConfig: Record<
  LeadStatus,
  { label: string; color: string; bg: string; border: string; rowBg: string }
> = {
  new: {
    label: "New",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    border: "border-blue-200 dark:border-blue-800",
    rowBg: "bg-blue-50/30 dark:bg-blue-950/20",
  },
  follow_up: {
    label: "Follow Up",
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-800",
    rowBg: "bg-amber-50/40 dark:bg-amber-950/20",
  },
  hot: {
    label: "Hot",
    color: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 dark:bg-red-900/30",
    border: "border-red-200 dark:border-red-800",
    rowBg: "bg-red-50/50 dark:bg-red-950/30",
  },
  cold: {
    label: "Cold",
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800",
    border: "border-slate-300 dark:border-slate-700",
    rowBg: "bg-slate-100/50 dark:bg-slate-900/30",
  },
  converted: {
    label: "Converted",
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-emerald-200 dark:border-emerald-800",
    rowBg: "bg-emerald-50/40 dark:bg-emerald-950/20",
  },
  lost: {
    label: "Lost",
    color: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-900/30",
    border: "border-rose-200 dark:border-rose-800",
    rowBg: "bg-rose-50/30 dark:bg-rose-950/20",
  },
};

type ViewType =
  | "all"
  | "today"
  | "follow_ups"
  | "hot"
  | "needs_attention"
  | "archived";

const viewTabs: { value: ViewType; label: string; icon: string }[] = [
  { value: "all", label: "All Leads", icon: "📋" },
  { value: "today", label: "Today's Activity", icon: "📅" },
  { value: "follow_ups", label: "Due Follow-ups", icon: "📞" },
  { value: "hot", label: "Hot Leads", icon: "🔥" },
  { value: "needs_attention", label: "Needs Attention", icon: "⚠️" },
  { value: "archived", label: "Archived", icon: "🗄️" },
];

// Classification options (Issue #3)
const classificationOptions = [
  { value: "direct_customer", label: "Direct Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "builder", label: "Builder" },
  { value: "dealer", label: "Dealer" },
  { value: "architect", label: "Architect" },
];

// Requirement type options (Issue #4)
const requirementTypeOptions = [
  { value: "residential_house", label: "Residential House" },
  { value: "commercial_building", label: "Commercial Building" },
  { value: "eco_friendly_building", label: "Eco-Friendly Building" },
  { value: "compound_wall", label: "Compound Wall" },
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchLeads(
  status: string,
  search: string,
  page: number,
  isArchived: boolean,
  fromDate?: string,
  toDate?: string,
) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  if (fromDate) params.set("from_date", fromDate);
  if (toDate) params.set("to_date", toDate);
  params.set("is_archived", String(isArchived));
  params.set("page", String(page));
  params.set("limit", "50");

  const res = await fetch(`/api/leads?${params}`);
  if (!res.ok) throw new Error("Failed to fetch leads");
  return res.json();
}

async function updateLeadArchiveStatus(id: string, isArchived: boolean) {
  const res = await fetch(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_archived: isArchived }),
  });
  if (!res.ok) throw new Error("Failed to update archive status");
  return res.json();
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type ViewMode = "list" | "kanban";

async function updateLeadStatus(id: string, status: LeadStatus) {
  const res = await fetch(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

export default function LeadsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeView, setActiveView] = useState<ViewType>("all");
  const [showArchivePanel, setShowArchivePanel] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const queryClient = useQueryClient();

  // Fetch archive suggestions count for badge
  const { data: archiveData } = useArchiveSuggestions();
  const pendingSuggestionsCount = archiveData?.suggestions?.length ?? 0;

  // Status Mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      updateLeadStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [classificationFilter, setClassificationFilter] = useState<string>("");
  const [requirementTypeFilter, setRequirementTypeFilter] =
    useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<
    "created_at" | "updated_at" | "name" | "ai_score"
  >("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [hoveredLead, setHoveredLead] = useState<Lead | null>(null);

  const isArchivedView = activeView === "archived";

  // Fetch leads
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["leads", statusFilter, search, page, isArchivedView],
    queryFn: () => fetchLeads(statusFilter, search, page, isArchivedView),
  });

  const allLeads: Lead[] = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.ceil(total / 50);

  // Archive Mutation
  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      updateLeadArchiveStatus(id, archive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(isArchivedView ? "Lead unarchived" : "Lead archived");
    },
    onError: () => toast.error("Failed to update lead"),
  });

  // Odoo Sync Mutation
  const odooSyncMutation = useMutation({
    mutationFn: (type: "full" | "push" | "pull") => syncAllWithOdoo(type),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Odoo Sync: ${data.message}`);
    },
    onError: (error) => {
      toast.error(
        `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  const handleArchiveToggle = (e: React.MouseEvent, lead: Lead) => {
    e.preventDefault(); // Prevent row click
    e.stopPropagation();
    archiveMutation.mutate({ id: lead.id, archive: !lead.is_archived });
  };

  const handleWhatsApp = (e: React.MouseEvent, contact: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(buildWhatsAppUrl(contact), "_blank");
  };

  const handleCall = (e: React.MouseEvent, contact: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`tel:${contact}`, "_self");
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // Client-side filtering/sorting for specific view tabs
  // (Note: To strictly follow 'archived' separate API call, we rely on 'isArchivedView' flag passed to API.
  // Other tabs like 'Follow Ups' act as filters on the *Active* leads list).
  const filteredLeads = useMemo(() => {
    let filtered = [...allLeads];
    const today = new Date().toDateString();

    // Client side filters (applied ON TOP of API result which already handles is_archived)
    switch (activeView) {
      case "today":
        filtered = filtered.filter(
          (l) =>
            new Date(l.created_at).toDateString() === today ||
            new Date(l.updated_at).toDateString() === today,
        );
        break;
      case "follow_ups":
        filtered = filtered.filter((l) => l.follow_up_date);
        break;
      case "hot":
        filtered = filtered.filter((l) => l.status === "hot");
        break;
      case "needs_attention":
        filtered = filtered.filter((l) => {
          const daysSinceUpdate = Math.floor(
            (Date.now() - new Date(l.updated_at).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          return (
            daysSinceUpdate > 7 &&
            l.status !== "converted" &&
            l.status !== "lost"
          );
        });
        break;
      case "archived":
        // API already handles this
        break;
    }

    // Apply classification filter (Issue #3)
    if (classificationFilter) {
      filtered = filtered.filter(
        (l) => l.classification === classificationFilter,
      );
    }

    // Apply requirement type filter (Issue #4)
    if (requirementTypeFilter) {
      filtered = filtered.filter(
        (l) => l.requirement_type === requirementTypeFilter,
      );
    }

    // Apply location filter (Issue #5) - searches in both site_region and site_location
    if (locationFilter) {
      const searchTerm = locationFilter.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.site_region?.toLowerCase().includes(searchTerm) ||
          l.site_location?.toLowerCase().includes(searchTerm),
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let valA, valB;
      if (sortBy === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === "created_at") {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (sortBy === "updated_at") {
        valA = new Date(a.updated_at).getTime();
        valB = new Date(b.updated_at).getTime();
      } else if (sortBy === "ai_score") {
        valA = a.ai_score || 0;
        valB = b.ai_score || 0;
      }

      if (valA! < valB!) return sortOrder === "asc" ? -1 : 1;
      if (valA! > valB!) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [
    allLeads,
    activeView,
    sortBy,
    sortOrder,
    classificationFilter,
    requirementTypeFilter,
    locationFilter,
  ]);

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Lead Management
            </span>
            <span className="text-sm font-normal bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-full">
              {total.toLocaleString()} total
            </span>
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Track, manage, and convert your leads with AI-powered insights
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg flex text-sm font-medium">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-1.5 rounded-md transition-all ${viewMode === "kanban" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              Kanban
            </button>
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowArchivePanel(true)}
            className="relative"
          >
            <ArchiveIcon className="h-4 w-4 mr-2" />
            Smart Archive
            {pendingSuggestionsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                {pendingSuggestionsCount > 9 ? "9+" : pendingSuggestionsCount}
              </span>
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={() => odooSyncMutation.mutate("full")}
            disabled={odooSyncMutation.isPending}
          >
            <OdooIcon className="h-4 w-4 mr-2" />
            {odooSyncMutation.isPending ? "Syncing..." : "Sync Odoo"}
          </Button>
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshIcon className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link href="/leads/new">
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              <PlusIcon className="h-4 w-4 mr-2" />
              New Lead
            </Button>
          </Link>
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {viewTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setActiveView(tab.value);
              setPage(1);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${
              activeView === tab.value
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* FILTERS BAR */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or notes..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              {Object.entries(statusConfig).map(([value, config]) => (
                <option key={value} value={value}>
                  {config.label}
                </option>
              ))}
            </select>

            {/* Classification Filter - Issue #3 */}
            <select
              value={classificationFilter}
              onChange={(e) => {
                setClassificationFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Classifications</option>
              {classificationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Requirement Type Filter - Issue #4 */}
            <select
              value={requirementTypeFilter}
              onChange={(e) => {
                setRequirementTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Requirement Types</option>
              {requirementTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Location Filter - Issue #5 */}
            <input
              type="text"
              placeholder="Filter by region/location..."
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
        </div>
      </Card>

      {/* CONTENT */}
      {viewMode === "kanban" ? (
        <div className="h-[calc(100vh-14rem)]">
          <LeadsKanban
            leads={filteredLeads}
            onStatusChange={(id, status) =>
              statusMutation.mutate({ id, status })
            }
            onLeadClick={(id) => (window.location.href = `/leads/${id}`)}
          />
        </div>
      ) : null}

      {/* LEADS TABLE */}
      {viewMode === "list" ? (
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Spinner size="lg" />
              <p className="mt-4 text-slate-500">Loading leads...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <div className="text-red-500 text-lg mb-2">
                Failed to load leads
              </div>
              <Button variant="secondary" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : filteredLeads.length === 0 ? (
            <EmptyState
              activeView={activeView}
              search={search}
              statusFilter={statusFilter}
            />
          ) : (
            <>
              {/* Table Header with Sort */}
              <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-3 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 select-none">
                <div
                  className="col-span-3 cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("name")}
                >
                  Lead {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div className="col-span-2">Contact</div>
                <div className="col-span-2">Source / Type</div>
                <div className="col-span-1">Status</div>
                <div
                  className="col-span-1 cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("ai_score")}
                >
                  Score{" "}
                  {sortBy === "ai_score" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div
                  className="col-span-1 cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("created_at")}
                >
                  Created{" "}
                  {sortBy === "created_at" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div
                  className="col-span-1 cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("updated_at")}
                >
                  Updated{" "}
                  {sortBy === "updated_at" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div className="col-span-1 text-center">Actions</div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLeads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    onHover={setHoveredLead}
                    isHovered={hoveredLead?.id === lead.id}
                    onArchive={(e) => handleArchiveToggle(e, lead)}
                    onWhatsApp={(e) => handleWhatsApp(e, lead.contact)}
                    onCall={(e) => handleCall(e, lead.contact)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                  <p className="text-sm text-slate-500">
                    Showing{" "}
                    <span className="font-medium text-slate-900 dark:text-white">
                      {(page - 1) * 50 + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium text-slate-900 dark:text-white">
                      {Math.min(page * 50, total)}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium text-slate-900 dark:text-white">
                      {total}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      ← Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      ) : null}

      {hoveredLead && <LeadHoverCard lead={hoveredLead} />}

      {/* Archive Panels */}
      <ArchiveSuggestionsPanel
        isOpen={showArchivePanel}
        onClose={() => setShowArchivePanel(false)}
      />
      <ArchiveConfigPanel
        isOpen={showConfigPanel}
        onClose={() => setShowConfigPanel(false)}
      />
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

function LeadRow({
  lead,
  onHover,
  isHovered: _isHovered,
  onArchive,
  onWhatsApp,
  onCall,
}: {
  lead: Lead;
  onHover: (lead: Lead | null) => void;
  isHovered: boolean;
  onArchive: (e: React.MouseEvent) => void;
  onWhatsApp: (e: React.MouseEvent) => void;
  onCall: (e: React.MouseEvent) => void;
}) {
  const status = statusConfig[lead.status];
  const isCreatedToday = isToday(lead.created_at);
  const isUpdatedToday = isToday(lead.updated_at) && !isCreatedToday;

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={`block lg:grid lg:grid-cols-12 gap-4 px-6 py-4 hover:brightness-95 dark:hover:brightness-110 transition-all relative group
        ${status.rowBg}
        ${isCreatedToday ? "border-l-4 border-l-green-500" : ""} ${isUpdatedToday ? "border-l-4 border-l-blue-500" : ""}`}
      onMouseEnter={() => onHover(lead)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="col-span-3 flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-medium text-sm">
          {lead.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-900 dark:text-white truncate flex items-center gap-2">
            {lead.name}
          </div>
          {lead.staff_notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {lead.staff_notes.slice(0, 50)}...
            </p>
          )}
        </div>
      </div>

      <div className="col-span-2 flex items-center">
        <span className="text-sm text-slate-600 dark:text-slate-400 font-mono">
          {lead.contact}
        </span>
      </div>

      <div className="col-span-2 flex flex-col justify-center">
        <span className="text-sm text-slate-900 dark:text-white">
          {lead.source}
        </span>
      </div>

      <div className="col-span-1 flex items-center">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${status.bg} ${status.color} border ${status.border}`}
        >
          {lead.status === "hot" && "🔥 "}
          {status.label}
        </span>
      </div>

      <div className="col-span-1 flex items-center">
        {lead.ai_score ? (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: `conic-gradient(${lead.ai_score >= 0.7 ? "#22c55e" : lead.ai_score >= 0.4 ? "#f59e0b" : "#ef4444"} ${lead.ai_score * 360}deg, #e5e7eb 0deg)`,
            }}
          >
            <span className="bg-white dark:bg-slate-900 w-6 h-6 rounded-full flex items-center justify-center text-slate-900 dark:text-white">
              {Math.round(lead.ai_score * 100)}
            </span>
          </div>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </div>

      <div className="col-span-1 flex items-center text-sm text-slate-500">
        {formatDate(lead.created_at)}
      </div>

      <div className="col-span-1 flex items-center text-sm text-slate-500">
        {formatDate(lead.updated_at)}
      </div>

      <div className="col-span-1 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onCall}
          title="Call"
          className="p-1 hover:bg-green-100 text-green-600 rounded"
        >
          📞
        </button>
        <button
          onClick={onWhatsApp}
          title="WhatsApp"
          className="p-1 hover:bg-green-100 text-green-600 rounded"
        >
          💬
        </button>
        <button
          onClick={onArchive}
          title={lead.is_archived ? "Unarchive" : "Archive"}
          className="p-1 hover:bg-slate-200 text-slate-600 rounded"
        >
          {lead.is_archived ? "↩️" : "🗄️"}
        </button>
      </div>
    </Link>
  );
}

function LeadHoverCard({ lead }: { lead: Lead }) {
  // Keep existing hover card logic essentially
  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 z-50 hidden lg:block animate-in slide-in-from-bottom-2">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">
            {lead.name}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {lead.contact}
          </p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Status</span>
          <span className={statusConfig[lead.status].color}>
            {statusConfig[lead.status].label}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  activeView: _activeView,
  search,
  statusFilter: _statusFilter,
}: {
  activeView: ViewType;
  search: string;
  statusFilter: string;
}) {
  if (search) return <div className="text-center py-12">No matches found.</div>;
  return <div className="text-center py-12">No leads in this view.</div>;
}

function PlusIcon({ className: _className }: { className?: string }) {
  return <span>+</span>;
}
function RefreshIcon({ className: _className }: { className?: string }) {
  return <span>🔄</span>;
}
function SearchIcon({ className: _className }: { className?: string }) {
  return <span>🔍</span>;
}
function ArchiveIcon({ className }: { className?: string }) {
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
        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
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
