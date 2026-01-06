'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge, Spinner } from '@maiyuri/ui';
import Link from 'next/link';
import type { Lead, LeadStatus } from '@maiyuri/shared';

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const statusConfig: Record<LeadStatus, { label: string; color: string; bg: string; border: string }> = {
  new: { label: 'New', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-800' },
  follow_up: { label: 'Follow Up', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-800' },
  hot: { label: 'Hot', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-200 dark:border-red-800' },
  cold: { label: 'Cold', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-300 dark:border-slate-700' },
  converted: { label: 'Converted', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-800' },
  lost: { label: 'Lost', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-200 dark:border-rose-800' },
};

type ViewType = 'all' | 'today' | 'follow_ups' | 'hot' | 'needs_attention';

const viewTabs: { value: ViewType; label: string; icon: string }[] = [
  { value: 'all', label: 'All Leads', icon: '📋' },
  { value: 'today', label: "Today's Activity", icon: '📅' },
  { value: 'follow_ups', label: 'Due Follow-ups', icon: '📞' },
  { value: 'hot', label: 'Hot Leads', icon: '🔥' },
  { value: 'needs_attention', label: 'Needs Attention', icon: '⚠️' },
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isOverdue(followUpDate: string | null | undefined): boolean {
  if (!followUpDate) return false;
  return new Date(followUpDate) < new Date();
}

function getDaysUntilFollowUp(followUpDate: string | null | undefined): number | null {
  if (!followUpDate) return null;
  const diff = Math.ceil((new Date(followUpDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchLeads(status: string, search: string, page: number, fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  if (fromDate) params.set('from_date', fromDate);
  if (toDate) params.set('to_date', toDate);
  params.set('page', String(page));
  params.set('limit', '50');

  const res = await fetch(`/api/leads?${params}`);
  if (!res.ok) throw new Error('Failed to fetch leads');
  return res.json();
}

async function fetchLeadStats() {
  const res = await fetch('/api/leads/stats');
  if (!res.ok) return null;
  return res.json();
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LeadsPage() {
  const [activeView, setActiveView] = useState<ViewType>('all');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at' | 'name'>('updated_at');
  const [hoveredLead, setHoveredLead] = useState<Lead | null>(null);

  // Fetch all leads for processing
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leads', statusFilter, search, page],
    queryFn: () => fetchLeads(statusFilter, search, page),
  });

  const allLeads: Lead[] = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.ceil(total / 50);

  // Calculate KPIs and filtered views
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);

    return {
      total: allLeads.length,
      newToday: allLeads.filter(l => new Date(l.created_at).toDateString() === today).length,
      updatedToday: allLeads.filter(l => new Date(l.updated_at).toDateString() === today && new Date(l.created_at).toDateString() !== today).length,
      hot: allLeads.filter(l => l.status === 'hot').length,
      followUpsDue: allLeads.filter(l => l.follow_up_date && isOverdue(l.follow_up_date)).length,
      followUpsToday: allLeads.filter(l => l.follow_up_date && isToday(l.follow_up_date)).length,
      converted: allLeads.filter(l => l.status === 'converted').length,
      needsAttention: allLeads.filter(l => {
        const daysSinceUpdate = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceUpdate > 7 && l.status !== 'converted' && l.status !== 'lost';
      }).length,
      avgScore: allLeads.filter(l => l.ai_score).reduce((sum, l) => sum + (l.ai_score || 0), 0) / (allLeads.filter(l => l.ai_score).length || 1),
    };
  }, [allLeads]);

  // Filter leads based on active view
  const filteredLeads = useMemo(() => {
    let filtered = [...allLeads];
    const today = new Date().toDateString();

    switch (activeView) {
      case 'today':
        filtered = filtered.filter(l =>
          new Date(l.created_at).toDateString() === today ||
          new Date(l.updated_at).toDateString() === today
        );
        break;
      case 'follow_ups':
        filtered = filtered.filter(l => l.follow_up_date);
        filtered.sort((a, b) => new Date(a.follow_up_date!).getTime() - new Date(b.follow_up_date!).getTime());
        break;
      case 'hot':
        filtered = filtered.filter(l => l.status === 'hot');
        break;
      case 'needs_attention':
        filtered = filtered.filter(l => {
          const daysSinceUpdate = Math.floor((Date.now() - new Date(l.updated_at).getTime()) / (1000 * 60 * 60 * 24));
          return daysSinceUpdate > 7 && l.status !== 'converted' && l.status !== 'lost';
        });
        break;
    }

    // Sort
    if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'created_at') {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    return filtered;
  }, [allLeads, activeView, sortBy]);

  return (
    <div className="space-y-6">
      {/* ================================================================== */}
      {/* HEADER */}
      {/* ================================================================== */}
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

      {/* ================================================================== */}
      {/* TODAY'S ACTIVITY DASHBOARD */}
      {/* ================================================================== */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Today&apos;s Activity
          </h2>
          <span className="text-sm opacity-80">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 hover:bg-white/30 transition-colors cursor-pointer" onClick={() => setActiveView('today')}>
            <div className="text-3xl font-bold">{stats.newToday}</div>
            <div className="text-sm opacity-90 flex items-center gap-1">
              <PlusIcon className="h-4 w-4" />
              New Leads
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 hover:bg-white/30 transition-colors cursor-pointer" onClick={() => setActiveView('today')}>
            <div className="text-3xl font-bold">{stats.updatedToday}</div>
            <div className="text-sm opacity-90 flex items-center gap-1">
              <EditIcon className="h-4 w-4" />
              Updated
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 hover:bg-white/30 transition-colors cursor-pointer" onClick={() => setActiveView('follow_ups')}>
            <div className="text-3xl font-bold">{stats.followUpsToday}</div>
            <div className="text-sm opacity-90 flex items-center gap-1">
              <PhoneIcon className="h-4 w-4" />
              Follow-ups Due
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 hover:bg-white/30 transition-colors cursor-pointer" onClick={() => setActiveView('needs_attention')}>
            <div className="text-3xl font-bold">{stats.needsAttention}</div>
            <div className="text-sm opacity-90 flex items-center gap-1">
              <AlertIcon className="h-4 w-4" />
              Needs Attention
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* KPI CARDS */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          title="Total Leads"
          value={stats.total}
          icon={<UsersIcon className="h-5 w-5" />}
          color="blue"
          onClick={() => setActiveView('all')}
        />
        <KPICard
          title="Hot Leads"
          value={stats.hot}
          icon={<FireIcon className="h-5 w-5" />}
          color="red"
          onClick={() => setActiveView('hot')}
        />
        <KPICard
          title="Overdue"
          value={stats.followUpsDue}
          icon={<ClockIcon className="h-5 w-5" />}
          color="amber"
          onClick={() => setActiveView('follow_ups')}
        />
        <KPICard
          title="Converted"
          value={stats.converted}
          icon={<CheckCircleIcon className="h-5 w-5" />}
          color="emerald"
          onClick={() => { setStatusFilter('converted'); setActiveView('all'); }}
        />
        <KPICard
          title="Avg Score"
          value={`${Math.round(stats.avgScore * 100)}%`}
          icon={<ChartIcon className="h-5 w-5" />}
          color="purple"
        />
      </div>

      {/* ================================================================== */}
      {/* VIEW TABS */}
      {/* ================================================================== */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {viewTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setActiveView(tab.value); setPage(1); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-all ${activeView === tab.value
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.value === 'today' && stats.newToday + stats.updatedToday > 0 && (
              <span className="bg-indigo-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {stats.newToday + stats.updatedToday}
              </span>
            )}
            {tab.value === 'follow_ups' && stats.followUpsDue > 0 && (
              <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {stats.followUpsDue}
              </span>
            )}
            {tab.value === 'hot' && stats.hot > 0 && (
              <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {stats.hot}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* FILTERS BAR */}
      {/* ================================================================== */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or notes..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              {Object.entries(statusConfig).map(([value, config]) => (
                <option key={value} value={value}>{config.label}</option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="updated_at">Recently Updated</option>
              <option value="created_at">Recently Created</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>
        </div>

        {/* Active Filters */}
        {(statusFilter || search || activeView !== 'all') && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500">Filters:</span>
            {activeView !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs rounded-lg">
                View: {viewTabs.find(t => t.value === activeView)?.label}
                <button onClick={() => setActiveView('all')} className="hover:text-indigo-900">×</button>
              </span>
            )}
            {statusFilter && (
              <span className={`inline-flex items-center gap-1 px-2 py-1 ${statusConfig[statusFilter as LeadStatus]?.bg} ${statusConfig[statusFilter as LeadStatus]?.color} text-xs rounded-lg`}>
                {statusConfig[statusFilter as LeadStatus]?.label}
                <button onClick={() => setStatusFilter('')} className="hover:opacity-70">×</button>
              </span>
            )}
            {search && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs rounded-lg">
                &ldquo;{search}&rdquo;
                <button onClick={() => setSearch('')} className="hover:text-slate-900">×</button>
              </span>
            )}
            <button
              onClick={() => { setActiveView('all'); setStatusFilter(''); setSearch(''); }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Clear all
            </button>
          </div>
        )}
      </Card>

      {/* ================================================================== */}
      {/* LEADS TABLE */}
      {/* ================================================================== */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Spinner size="lg" />
            <p className="mt-4 text-slate-500">Loading leads...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <div className="text-red-500 text-lg mb-2">Failed to load leads</div>
            <Button variant="secondary" onClick={() => refetch()}>Try Again</Button>
          </div>
        ) : filteredLeads.length === 0 ? (
          <EmptyState activeView={activeView} search={search} statusFilter={statusFilter} />
        ) : (
          <>
            {/* Table Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-3 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <div className="col-span-3">Lead</div>
              <div className="col-span-2">Contact</div>
              <div className="col-span-2">Source / Type</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Score</div>
              <div className="col-span-1">Created</div>
              <div className="col-span-1">Updated</div>
              <div className="col-span-1">Follow-up</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onHover={setHoveredLead}
                  isHovered={hoveredLead?.id === lead.id}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                <p className="text-sm text-slate-500">
                  Showing <span className="font-medium text-slate-900 dark:text-white">{((page - 1) * 50) + 1}</span> to{' '}
                  <span className="font-medium text-slate-900 dark:text-white">{Math.min(page * 50, total)}</span> of{' '}
                  <span className="font-medium text-slate-900 dark:text-white">{total}</span>
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    ← Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = page <= 3 ? i + 1 : page + i - 2;
                      if (pageNum > totalPages || pageNum < 1) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-sm font-medium ${pageNum === page
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Next →
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Hover Details Tooltip */}
      {hoveredLead && <LeadHoverCard lead={hoveredLead} />}
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

function KPICard({ title, value, icon, color, onClick }: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'blue' | 'red' | 'amber' | 'emerald' | 'purple';
  onClick?: () => void;
}) {
  const colors = {
    blue: 'from-blue-500 to-blue-600 shadow-blue-200 dark:shadow-blue-900/50',
    red: 'from-red-500 to-red-600 shadow-red-200 dark:shadow-red-900/50',
    amber: 'from-amber-500 to-amber-600 shadow-amber-200 dark:shadow-amber-900/50',
    emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-200 dark:shadow-emerald-900/50',
    purple: 'from-purple-500 to-purple-600 shadow-purple-200 dark:shadow-purple-900/50',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-br ${colors[color]} rounded-xl p-4 text-white shadow-lg cursor-pointer hover:scale-105 transition-transform`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="opacity-80">{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-80">{title}</div>
    </div>
  );
}

function LeadRow({ lead, onHover, isHovered }: { lead: Lead; onHover: (lead: Lead | null) => void; isHovered: boolean }) {
  const status = statusConfig[lead.status];
  const daysUntilFollowUp = getDaysUntilFollowUp(lead.follow_up_date);
  const isOverdueFollowUp = daysUntilFollowUp !== null && daysUntilFollowUp < 0;
  const isDueToday = daysUntilFollowUp === 0;
  const isCreatedToday = isToday(lead.created_at);
  const isUpdatedToday = isToday(lead.updated_at) && !isCreatedToday;

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={`block lg:grid lg:grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors relative ${isOverdueFollowUp ? 'bg-red-50/50 dark:bg-red-900/10' : ''
        } ${isCreatedToday ? 'border-l-4 border-l-green-500' : ''} ${isUpdatedToday ? 'border-l-4 border-l-blue-500' : ''}`}
      onMouseEnter={() => onHover(lead)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Lead Name & Tags */}
      <div className="col-span-3 flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-medium text-sm">
          {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-900 dark:text-white truncate flex items-center gap-2">
            {lead.name}
            {isCreatedToday && <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded">NEW</span>}
            {isUpdatedToday && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">UPDATED</span>}
          </div>
          {lead.staff_notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5" title={lead.staff_notes}>
              📝 {lead.staff_notes.slice(0, 50)}...
            </p>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="col-span-2 flex items-center">
        <span className="text-sm text-slate-600 dark:text-slate-400 font-mono">{lead.contact}</span>
      </div>

      {/* Source / Type */}
      <div className="col-span-2 flex flex-col justify-center">
        <span className="text-sm text-slate-900 dark:text-white">{lead.source}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{lead.lead_type}</span>
      </div>

      {/* Status */}
      <div className="col-span-1 flex items-center">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${status.bg} ${status.color} border ${status.border}`}>
          {lead.status === 'hot' && '🔥 '}
          {status.label}
        </span>
      </div>

      {/* AI Score */}
      <div className="col-span-1 flex items-center">
        {lead.ai_score ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{
              background: `conic-gradient(${lead.ai_score >= 0.7 ? '#22c55e' : lead.ai_score >= 0.4 ? '#f59e0b' : '#ef4444'} ${lead.ai_score * 360}deg, #e5e7eb 0deg)`,
            }}>
              <span className="bg-white dark:bg-slate-900 w-6 h-6 rounded-full flex items-center justify-center text-slate-900 dark:text-white">
                {Math.round(lead.ai_score * 100)}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-slate-400 text-sm">-</span>
        )}
      </div>

      {/* Created */}
      <div className="col-span-1 flex items-center">
        <span className={`text-sm ${isCreatedToday ? 'text-green-600 dark:text-green-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
          {formatDate(lead.created_at) || '-'}
        </span>
      </div>

      {/* Updated */}
      <div className="col-span-1 flex items-center">
        <span className={`text-sm ${isUpdatedToday ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
          {formatDate(lead.updated_at) || '-'}
        </span>
      </div>

      {/* Follow-up */}
      <div className="col-span-1 flex items-center">
        {lead.follow_up_date ? (
          <span className={`text-sm font-medium flex items-center gap-1 ${isOverdueFollowUp ? 'text-red-600 dark:text-red-400' :
              isDueToday ? 'text-amber-600 dark:text-amber-400' :
                'text-slate-500 dark:text-slate-400'
            }`}>
            {isOverdueFollowUp && '⚠️'}
            {isDueToday && '📞'}
            {formatDate(lead.follow_up_date)}
          </span>
        ) : (
          <span className="text-slate-400 text-sm">-</span>
        )}
      </div>

      {/* Mobile View */}
      <div className="lg:hidden mt-3 flex flex-wrap gap-2">
        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${status.bg} ${status.color}`}>
          {status.label}
        </span>
        {lead.ai_score && (
          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${lead.ai_score >= 0.7 ? 'bg-green-100 text-green-700' :
              lead.ai_score >= 0.4 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            }`}>
            {Math.round(lead.ai_score * 100)}% Score
          </span>
        )}
        <span className="text-xs text-slate-500">Created {formatDate(lead.created_at)}</span>
      </div>
    </Link>
  );
}

function LeadHoverCard({ lead }: { lead: Lead }) {
  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 z-50 hidden lg:block animate-in slide-in-from-bottom-2">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">{lead.name}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{lead.contact}</p>
        </div>
        {lead.ai_score && (
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white ${lead.ai_score >= 0.7 ? 'bg-green-500' :
              lead.ai_score >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
            }`}>
            {Math.round(lead.ai_score * 100)}%
          </div>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Status</span>
          <span className={statusConfig[lead.status].color}>{statusConfig[lead.status].label}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Source</span>
          <span className="text-slate-900 dark:text-white">{lead.source}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Type</span>
          <span className="text-slate-900 dark:text-white">{lead.lead_type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Created</span>
          <span className="text-slate-900 dark:text-white">{formatFullDate(lead.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Last Updated</span>
          <span className="text-slate-900 dark:text-white">{formatFullDate(lead.updated_at)}</span>
        </div>
        {lead.follow_up_date && (
          <div className="flex justify-between">
            <span className="text-slate-500">Follow-up</span>
            <span className={isOverdue(lead.follow_up_date) ? 'text-red-600' : 'text-slate-900 dark:text-white'}>
              {formatFullDate(lead.follow_up_date)}
            </span>
          </div>
        )}
      </div>

      {lead.ai_summary && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 mb-1">AI Summary</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">{lead.ai_summary}</p>
        </div>
      )}

      {lead.staff_notes && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 mb-1">Staff Notes</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{lead.staff_notes}</p>
        </div>
      )}
    </div>
  );
}

function EmptyState({ activeView, search, statusFilter }: { activeView: ViewType; search: string; statusFilter: string }) {
  const messages: Record<ViewType, { title: string; description: string }> = {
    all: { title: 'No leads yet', description: 'Create your first lead to get started.' },
    today: { title: 'No activity today', description: 'No leads were created or updated today.' },
    follow_ups: { title: 'No follow-ups due', description: 'All caught up! No pending follow-ups.' },
    hot: { title: 'No hot leads', description: 'No leads are currently marked as hot.' },
    needs_attention: { title: 'All leads are healthy', description: 'Great job! All leads have been recently updated.' },
  };

  if (search || statusFilter) {
    return (
      <div className="text-center py-16">
        <SearchIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No matching leads</h3>
        <p className="text-slate-500 dark:text-slate-400">Try adjusting your search or filters.</p>
      </div>
    );
  }

  const msg = messages[activeView];
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">
        {activeView === 'all' && '📋'}
        {activeView === 'today' && '📅'}
        {activeView === 'follow_ups' && '✅'}
        {activeView === 'hot' && '❄️'}
        {activeView === 'needs_attention' && '👍'}
      </div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">{msg.title}</h3>
      <p className="text-slate-500 dark:text-slate-400 mb-4">{msg.description}</p>
      {activeView === 'all' && (
        <Link href="/leads/new">
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            Create your first lead
          </Button>
        </Link>
      )}
    </div>
  );
}

// ============================================================================
// ICONS
// ============================================================================

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function FireIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
