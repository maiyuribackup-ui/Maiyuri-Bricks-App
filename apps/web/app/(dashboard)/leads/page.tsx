"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Spinner } from "@maiyuri/ui";
import { LeadsKanban } from "./LeadsKanban";
import Link from "next/link";
import {
  buildWhatsAppUrl,
  type Lead,
  type LeadStatus,
  type PipelineStage,
} from "@maiyuri/shared";
import { Toaster, toast } from "sonner";
import { HelpButton } from "@/components/help";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_MAP,
  LEAD_STATUS_MAP,
  LEAD_TEMPERATURE_MAP,
} from "@/lib/lead-taxonomy";
import {
  getAging,
  getNextAction,
  triageScore,
  URGENCY_STYLES,
} from "@/lib/lead-insights";
import { LeadQuickActions } from "@/components/leads/LeadQuickActions";

// ============================================================================
// CONSTANTS & HELPERS (derived from the V2 lead taxonomy)
// ============================================================================

// Lead-status display config (action state), shape kept stable for the row UI
const statusConfig = Object.fromEntries(
  Object.values(LEAD_STATUS_MAP).map((o) => [
    o.value,
    {
      label: o.label,
      color: o.color,
      bg: o.bg,
      border: "border-slate-200 dark:border-slate-700",
      rowBg: o.bg,
    },
  ]),
) as Record<
  LeadStatus,
  { label: string; color: string; bg: string; border: string; rowBg: string }
>;

// Pipeline-stage display config (sales journey)
const stageConfig = Object.fromEntries(
  PIPELINE_STAGES.map((o) => [
    o.value,
    { label: o.label, icon: o.emoji, color: `${o.bg} ${o.color}` },
  ]),
) as Record<PipelineStage, { label: string; icon: string; color: string }>;

type GroupKey =
  | "temperature"
  | "lead_status"
  | "pipeline_stage"
  | "source"
  | "none";

const groupByOptions: { value: GroupKey; label: string }[] = [
  { value: "temperature", label: "Temperature" },
  { value: "lead_status", label: "Status" },
  { value: "pipeline_stage", label: "Stage" },
  { value: "source", label: "Source" },
  { value: "none", label: "No grouping" },
];

interface LeadGroup {
  key: string;
  label: string;
  emoji?: string;
  leads: Lead[];
}

// Partition an already-sorted list into ordered groups. The incoming `leads`
// keep their sort (default: last-updated desc), so within each group the order
// is preserved — we only bucket + order the buckets themselves.
function buildGroups(leads: Lead[], groupBy: GroupKey): LeadGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", leads }];
  }

  const buckets = new Map<string, Lead[]>();
  const getKey = (l: Lead): string => {
    if (groupBy === "temperature") return l.lead_temperature || "unknown";
    if (groupBy === "lead_status") return l.lead_status || "unknown";
    if (groupBy === "pipeline_stage") return l.pipeline_stage || "unknown";
    return l.source || "Unknown";
  };

  for (const lead of leads) {
    const k = getKey(lead);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(lead);
  }

  // Define a stable display order + labels per group type.
  let order: string[];
  let labelFor: (k: string) => { label: string; emoji?: string };

  if (groupBy === "temperature") {
    order = ["hot", "warm", "cold"];
    labelFor = (k) => {
      const t = LEAD_TEMPERATURE_MAP[k as keyof typeof LEAD_TEMPERATURE_MAP];
      return t ? { label: t.label, emoji: t.emoji } : { label: k };
    };
  } else if (groupBy === "lead_status") {
    order = Object.values(LEAD_STATUS_MAP).map((o) => o.value);
    labelFor = (k) => ({ label: statusConfig[k as LeadStatus]?.label ?? k });
  } else if (groupBy === "pipeline_stage") {
    order = PIPELINE_STAGES.map((o) => o.value);
    labelFor = (k) => {
      const s = stageConfig[k as PipelineStage];
      return s ? { label: s.label, emoji: s.icon } : { label: k };
    };
  } else {
    // source: order by bucket size (largest first)
    order = Array.from(buckets.keys()).sort(
      (a, b) => (buckets.get(b)?.length ?? 0) - (buckets.get(a)?.length ?? 0),
    );
    labelFor = (k) => ({ label: k });
  }

  const groups: LeadGroup[] = [];
  const seen = new Set<string>();
  for (const k of order) {
    const list = buckets.get(k);
    if (list && list.length > 0) {
      groups.push({ key: k, ...labelFor(k), leads: list });
      seen.add(k);
    }
  }
  // Append any buckets not covered by the predefined order (e.g. "unknown").
  for (const [k, list] of buckets) {
    if (!seen.has(k) && list.length > 0) {
      groups.push({ key: k, ...labelFor(k), leads: list });
    }
  }
  return groups;
}

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
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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

async function patchLead(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update lead");
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

async function updateLeadStage(id: string, pipeline_stage: PipelineStage) {
  const res = await fetch(`/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pipeline_stage,
      stage_updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error("Failed to update stage");
  return res.json();
}

export default function LeadsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeView, setActiveView] = useState<ViewType>("all");
  const queryClient = useQueryClient();

  // Status Mutation
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PipelineStage }) =>
      updateLeadStage(id, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Pipeline stage updated");
    },
    onError: () => toast.error("Failed to update stage"),
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
  const [showFilters, setShowFilters] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupKey>("temperature");
  const [actionLead, setActionLead] = useState<Lead | null>(null);

  const activeFilterCount =
    (statusFilter ? 1 : 0) +
    (classificationFilter ? 1 : 0) +
    (requirementTypeFilter ? 1 : 0) +
    (locationFilter ? 1 : 0);

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

  // Staff list for the reassign action (cached; any authenticated user can read)
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const staffUsers: { id: string; name: string; role?: string }[] =
    usersData?.data ?? [];

  // Inline quick-action patch (stage / temperature / follow-up / reassign).
  const quickPatch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      patchLead(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated");
      setActionLead(null);
    },
    onError: () => toast.error("Update failed"),
  });

  // One-tap Smart Quote generation from the list.
  const generateQuote = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await fetch("/api/smart-quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Failed to generate quote");
      }
      return res.json();
    },
    onSuccess: (json) => {
      const slug = json?.data?.link_slug;
      setActionLead(null);
      if (slug) {
        toast.success("Smart Quote ready — opening…");
        window.open(`${window.location.origin}/sq/${slug}`, "_blank");
      } else {
        toast.success("Smart Quote generated");
      }
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to generate quote"),
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

  const handleMore = (e: React.MouseEvent, lead: Lead) => {
    e.preventDefault();
    e.stopPropagation();
    setActionLead(lead);
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
        filtered = filtered.filter((l) => l.lead_temperature === "hot");
        break;
      case "needs_attention":
        filtered = filtered.filter((l) => {
          const daysSinceUpdate = Math.floor(
            (Date.now() - new Date(l.updated_at).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          return (
            daysSinceUpdate > 7 &&
            l.pipeline_stage !== "order_won" &&
            l.pipeline_stage !== "closed_lost"
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

  // Ordered groups for the list view (default: by temperature, last-updated
  // order preserved within each group via the sort above).
  const groups = useMemo(
    () => buildGroups(filteredLeads, groupBy),
    [filteredLeads, groupBy],
  );

  // "Call next" triage — the most urgent leads to action right now, ranked by
  // overdue follow-ups, temperature, decay and AI score. Drawn from the full
  // loaded set so priorities surface regardless of the active view tab.
  const callNextLeads = useMemo(() => {
    if (isArchivedView) return [];
    return allLeads
      .map((l) => ({ lead: l, score: triageScore(l) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.lead);
  }, [allLeads, isArchivedView]);

  return (
    <div className="space-y-6 relative">
      {/* Decorative gradient backdrop — gives the glass cards colour to blur */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-indigo-300/30 dark:bg-indigo-600/15 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[26rem] h-[26rem] rounded-full bg-cyan-300/25 dark:bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[24rem] h-[24rem] rounded-full bg-violet-300/25 dark:bg-fuchsia-600/10 blur-3xl" />
      </div>
      <Toaster position="top-right" />
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Lead Management
            </span>
            <span className="text-xs lg:text-sm font-normal bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
              {total.toLocaleString()}
            </span>
          </h1>
          <p className="mt-1 text-sm lg:text-base text-slate-500 dark:text-slate-400 hidden sm:block">
            Track, manage, and convert your leads with AI-powered insights
          </p>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
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
          <div className="hidden lg:block">
            <HelpButton section="leads" variant="icon" />
          </div>
          <Link href="/leads/new" className="flex-1 lg:flex-none">
            <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              <PlusIcon className="h-4 w-4 mr-1" />
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
      <Card className="p-3 lg:p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search name or phone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {/* Mobile-only filter toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="lg:hidden relative flex items-center gap-1.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              ⚙️
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center text-[10px] font-bold text-white bg-blue-600 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          <div
            className={`${showFilters ? "grid" : "hidden"} grid-cols-2 gap-2 lg:flex lg:flex-wrap`}
          >
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
              placeholder="Region/location..."
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setPage(1);
              }}
              className="col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full lg:w-48"
            />
          </div>
        </div>
      </Card>

      {/* CALL-NEXT TRIAGE STRIP */}
      {viewMode === "list" && callNextLeads.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              ⚡ Call next
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {callNextLeads.length} most urgent
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
            {callNextLeads.map((lead) => {
              const action = getNextAction(lead);
              return (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="snap-start flex-shrink-0 w-60 bg-white/75 dark:bg-slate-900/55 backdrop-blur-xl rounded-2xl ring-1 ring-black/5 dark:ring-white/10 p-3 shadow-lg shadow-slate-900/5 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate text-sm">
                        {lead.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {lead.contact}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleCall(e, lead.contact)}
                      aria-label="Call"
                      className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-green-500 text-white active:bg-green-600"
                    >
                      📞
                    </button>
                  </div>
                  {action && (
                    <p
                      className={`mt-2 text-xs font-medium ${URGENCY_STYLES[action.urgency]}`}
                    >
                      {action.text}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* GROUP-BY TOOLBAR (list view) */}
      {viewMode === "list" && (
        <div className="flex items-center justify-between gap-3 -mb-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filteredLeads.length}{" "}
            {filteredLeads.length === 1 ? "lead" : "leads"}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
              Group by
            </span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupKey)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {groupByOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* CONTENT */}
      {viewMode === "kanban" ? (
        <div className="h-[calc(100vh-14rem)]">
          <LeadsKanban
            leads={filteredLeads}
            onStageChange={(id, stage) => stageMutation.mutate({ id, stage })}
            onLeadClick={(id) => (window.location.href = `/leads/${id}`)}
          />
        </div>
      ) : null}

      {/* LEADS TABLE */}
      {viewMode === "list" ? (
        <Card className="border-0 bg-transparent p-0 shadow-none overflow-visible lg:border lg:bg-card lg:p-6 lg:shadow-sm lg:overflow-hidden">
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
                  className="col-span-2 cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("name")}
                >
                  Lead {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
                </div>
                <div className="col-span-2">Contact</div>
                <div className="col-span-1">Source</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1">Stage</div>
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
                <div className="col-span-2 text-center">Actions</div>
              </div>

              {/* Table Rows (grouped) */}
              <div>
                {groups.map((group) => (
                  <div key={group.key} className="mb-4 lg:mb-0">
                    {groupBy !== "none" && (
                      <div className="sticky top-0 z-10 flex items-center gap-2 mb-2 lg:mb-0 px-3 py-2 rounded-xl lg:rounded-none bg-white/70 dark:bg-slate-900/70 backdrop-blur-md lg:bg-slate-100/95 dark:lg:bg-slate-800/95 lg:px-6 lg:border-y lg:border-slate-200 dark:lg:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 ring-1 ring-black/5 dark:ring-white/10 lg:ring-0">
                        {group.emoji && <span className="text-sm">{group.emoji}</span>}
                        <span>{group.label || "Other"}</span>
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[10px] normal-case font-bold shadow-sm">
                          {group.leads.length}
                        </span>
                      </div>
                    )}
                    <div className="space-y-3 lg:space-y-0 lg:divide-y lg:divide-slate-100 dark:lg:divide-slate-800">
                      {group.leads.map((lead) => (
                        <LeadRow
                          key={lead.id}
                          lead={lead}
                          onHover={setHoveredLead}
                          isHovered={hoveredLead?.id === lead.id}
                          onArchive={(e) => handleArchiveToggle(e, lead)}
                          onWhatsApp={(e) => handleWhatsApp(e, lead.contact)}
                          onCall={(e) => handleCall(e, lead.contact)}
                          onMore={(e) => handleMore(e, lead)}
                        />
                      ))}
                    </div>
                  </div>
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

      {actionLead && (
        <LeadQuickActions
          lead={actionLead}
          users={staffUsers}
          busy={quickPatch.isPending || generateQuote.isPending}
          onClose={() => setActionLead(null)}
          onPatch={(body) =>
            quickPatch.mutate({ id: actionLead.id, body })
          }
          onGenerateQuote={() => generateQuote.mutate(actionLead.id)}
        />
      )}
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

// Compact circular AI-score gauge, shared by the mobile card + desktop row.
function ScoreRing({ score, size = 32 }: { score: number; size?: number }) {
  const pct = Math.round(score * 100);
  const ringColor =
    score >= 0.7 ? "#22c55e" : score >= 0.4 ? "#f59e0b" : "#ef4444";
  const inner = size - 8;
  return (
    <div
      className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${ringColor} ${score * 360}deg, #e5e7eb 0deg)`,
      }}
    >
      <span
        className="bg-white dark:bg-slate-900 rounded-full flex items-center justify-center text-slate-900 dark:text-white"
        style={{ width: inner, height: inner }}
      >
        {pct}
      </span>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function LeadRow({
  lead,
  onHover,
  isHovered: _isHovered,
  onArchive,
  onWhatsApp,
  onCall,
  onMore,
}: {
  lead: Lead;
  onHover: (lead: Lead | null) => void;
  isHovered: boolean;
  onArchive: (e: React.MouseEvent) => void;
  onWhatsApp: (e: React.MouseEvent) => void;
  onCall: (e: React.MouseEvent) => void;
  onMore: (e: React.MouseEvent) => void;
}) {
  const status = statusConfig[lead.lead_status];
  const isCreatedToday = isToday(lead.created_at);
  const isUpdatedToday = isToday(lead.updated_at) && !isCreatedToday;

  const stage = stageConfig[lead.pipeline_stage];
  const temp = LEAD_TEMPERATURE_MAP[lead.lead_temperature];

  const aging = getAging(lead);
  const nextAction = getNextAction(lead);

  // Accent rail priority: stale (red) > created today (green) > updated (blue).
  const rail = aging.stale
    ? "border-l-4 border-l-red-500"
    : isCreatedToday
      ? "border-l-4 border-l-green-500"
      : isUpdatedToday
        ? "border-l-4 border-l-blue-500"
        : "";

  // Temperature-coded avatar gradient — meaningful colour at a glance.
  const avatarGradient =
    lead.lead_temperature === "hot"
      ? "from-rose-400 to-red-500"
      : lead.lead_temperature === "warm"
        ? "from-amber-400 to-orange-500"
        : "from-sky-400 to-blue-500";

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={`block relative group transition-all
        rounded-2xl bg-white/75 dark:bg-slate-900/55 backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10 shadow-lg shadow-slate-900/5 active:scale-[0.99]
        lg:rounded-none lg:bg-transparent lg:backdrop-blur-none lg:ring-0 lg:shadow-none lg:hover:brightness-95 dark:lg:hover:brightness-110
        overflow-hidden
        ${rail}`}
      onMouseEnter={() => onHover(lead)}
      onMouseLeave={() => onHover(null)}
    >
      {/* ===================== MOBILE CARD (< lg) ===================== */}
      <div className="lg:hidden p-4">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <div
              className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white font-bold text-sm shadow-md`}
            >
              {initials(lead.name)}
            </div>
            <span className="absolute -bottom-1 -right-1 text-base leading-none drop-shadow">
              {temp.emoji}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white truncate text-[15px]">
                {lead.name}
              </h3>
              {lead.ai_score ? <ScoreRing score={lead.ai_score} size={34} /> : null}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              {lead.contact}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${status.bg} ${status.color} border ${status.border}`}
              >
                {status.label}
              </span>
              {stage && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${stage.color}`}
                >
                  <span>{stage.icon}</span>
                  {stage.label}
                </span>
              )}
              {lead.source && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                  {lead.source}
                </span>
              )}
              {aging.stale && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30">
                  ⏳ {aging.label}
                </span>
              )}
            </div>

            {nextAction && (
              <p
                className={`mt-1.5 text-xs font-medium flex items-center gap-1 ${URGENCY_STYLES[nextAction.urgency]}`}
              >
                <span>→</span>
                {nextAction.text}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-700/60 pt-2.5">
          <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-2 min-w-0">
            <span className="truncate">
              {isCreatedToday ? "🆕 Added today" : `Updated ${formatDate(lead.updated_at)}`}
            </span>
            {lead.follow_up_date && (
              <span className="flex items-center gap-0.5 whitespace-nowrap">
                📞 {formatDate(lead.follow_up_date)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={onCall}
              aria-label="Call"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 active:bg-green-100"
            >
              📞
            </button>
            <button
              onClick={onWhatsApp}
              aria-label="WhatsApp"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 active:bg-emerald-100"
            >
              💬
            </button>
            <button
              onClick={onArchive}
              aria-label={lead.is_archived ? "Unarchive" : "Archive"}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 active:bg-slate-200"
            >
              {lead.is_archived ? "↩️" : "🗄️"}
            </button>
            <button
              onClick={onMore}
              aria-label="Quick actions"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 active:bg-blue-100 text-lg font-bold"
            >
              ⋯
            </button>
          </div>
        </div>
      </div>

      {/* ===================== DESKTOP ROW (lg+) ===================== */}
      <div className={`hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-4 ${status.rowBg}`}>
      <div className="col-span-2 flex items-start gap-3">
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
          {nextAction ? (
            <p
              className={`text-xs truncate mt-0.5 font-medium ${URGENCY_STYLES[nextAction.urgency]}`}
              title={nextAction.text}
            >
              → {nextAction.text}
            </p>
          ) : lead.staff_notes ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {lead.staff_notes.slice(0, 30)}...
            </p>
          ) : null}
        </div>
      </div>

      <div className="col-span-2 flex items-center">
        <span className="text-sm text-slate-600 dark:text-slate-400 font-mono">
          {lead.contact}
        </span>
      </div>

      <div className="col-span-1 flex flex-col justify-center">
        <span className="text-sm text-slate-900 dark:text-white truncate">
          {lead.source}
        </span>
      </div>

      <div className="col-span-1 flex items-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${status.bg} ${status.color} border ${status.border}`}
          title={`${LEAD_STATUS_MAP[lead.lead_status].label} — ${LEAD_STATUS_MAP[lead.lead_status].hint}`}
        >
          <span
            className="mr-1"
            title={`${temp.label} — ${temp.hint}`}
          >
            {temp.emoji}
          </span>
          {status.label}
        </span>
      </div>

      {/* Pipeline Stage Column */}
      <div className="col-span-1 flex items-center">
        {stage ? (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${stage.color}`}
            title={`${PIPELINE_STAGE_MAP[lead.pipeline_stage].label} — ${PIPELINE_STAGE_MAP[lead.pipeline_stage].hint}`}
          >
            <span>{stage.icon}</span>
            <span className="hidden xl:inline truncate">{stage.label}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
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

      <div className="col-span-1 flex flex-col justify-center text-sm text-slate-500">
        <span>{formatDate(lead.updated_at)}</span>
        {aging.stale && (
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
            ⏳ {aging.label}
          </span>
        )}
      </div>

      <div className="col-span-2 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onCall}
          title="Call"
          className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded"
        >
          📞
        </button>
        <button
          onClick={onWhatsApp}
          title="WhatsApp"
          className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded"
        >
          💬
        </button>
        <button
          onClick={onArchive}
          title={lead.is_archived ? "Unarchive" : "Archive"}
          className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded"
        >
          {lead.is_archived ? "↩️" : "🗄️"}
        </button>
        <button
          onClick={onMore}
          title="Quick actions"
          className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 rounded font-bold"
        >
          ⋯
        </button>
      </div>
      </div>
    </Link>
  );
}

function LeadHoverCard({ lead }: { lead: Lead }) {
  const stage = stageConfig[lead.pipeline_stage];

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
          <span className={statusConfig[lead.lead_status].color}>
            {statusConfig[lead.lead_status].label}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Stage</span>
          {stage ? (
            <span className={stage.color + " px-2 py-0.5 rounded text-xs"}>
              {stage.icon} {stage.label}
            </span>
          ) : (
            <span className="text-slate-400">-</span>
          )}
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
function SearchIcon({ className: _className }: { className?: string }) {
  return <span>🔍</span>;
}
