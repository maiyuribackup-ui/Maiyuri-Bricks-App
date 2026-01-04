'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge, Spinner } from '@maiyuri/ui';
import Link from 'next/link';
import type { Lead, LeadStatus } from '@maiyuri/shared';

const statusLabels: Record<LeadStatus, string> = {
  new: 'New',
  follow_up: 'Follow Up',
  hot: 'Hot',
  cold: 'Cold',
  converted: 'Converted',
  lost: 'Lost',
};

const statusFilters: { value: LeadStatus | ''; label: string }[] = [
  { value: '', label: 'All Status' },
  { value: 'new', label: 'New' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'hot', label: 'Hot' },
  { value: 'cold', label: 'Cold' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
];

async function fetchLeads(status: string, search: string, page: number) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  params.set('page', String(page));
  params.set('limit', '20');

  const res = await fetch(`/api/leads?${params}`);
  if (!res.ok) throw new Error('Failed to fetch leads');
  return res.json();
}

export default function LeadsPage() {
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['leads', status, search, page],
    queryFn: () => fetchLeads(status, search, page),
  });

  const leads: Lead[] = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Leads
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage and track your leads
          </p>
        </div>
        <Link href="/leads/new">
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            New Lead
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name or contact..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {statusFilters.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Leads List */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            Failed to load leads. Please try again.
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">
              {search || status ? 'No leads match your filters.' : 'No leads yet.'}
            </p>
            {!search && !status && (
              <Link
                href="/leads/new"
                className="mt-4 inline-flex items-center gap-x-2 text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                <PlusIcon className="h-4 w-4" />
                Create your first lead
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Mobile view - Cards */}
            <div className="sm:hidden divide-y divide-slate-200 dark:divide-slate-700">
              {leads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="block p-4 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {lead.name}
                    </span>
                    <Badge
                      variant={
                        lead.status === 'hot' ? 'danger' :
                        lead.status === 'converted' ? 'success' :
                        lead.status === 'follow_up' ? 'warning' : 'default'
                      }
                    >
                      {statusLabels[lead.status]}
                    </Badge>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {lead.contact} • {lead.source}
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop view - Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-700">
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      onClick={() => window.location.href = `/leads/${lead.id}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {lead.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                        {lead.contact}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                        {lead.source}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                        {lead.lead_type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={
                            lead.status === 'hot' ? 'danger' :
                            lead.status === 'converted' ? 'success' :
                            lead.status === 'follow_up' ? 'warning' : 'default'
                          }
                        >
                          {statusLabels[lead.status]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {lead.ai_score ? (
                          <span className={
                            lead.ai_score >= 0.7 ? 'text-green-600' :
                            lead.ai_score >= 0.4 ? 'text-yellow-600' : 'text-red-600'
                          }>
                            {Math.round(lead.ai_score * 100)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-500">
                  Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
