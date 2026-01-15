'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, Button, Badge, Spinner, Modal } from '@maiyuri/ui';
import { createNoteSchema, type CreateNoteInput, type Lead, type Note, type LeadStatus, type CallRecording } from '@maiyuri/shared';
import { AIAnalysisPanel, AudioUpload } from '@/components/leads';
import { LeadIntelligenceSummary } from '@/components/leads/LeadIntelligenceSummary';
import { LeadActivityTimeline } from '@/components/timeline';
import { PriceEstimatorPanel } from '@/components/estimates';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';

const statusLabels: Record<LeadStatus, string> = {
  new: 'New',
  follow_up: 'Follow Up',
  hot: 'Hot',
  cold: 'Cold',
  converted: 'Converted',
  lost: 'Lost',
};

const statusOptions: LeadStatus[] = ['new', 'follow_up', 'hot', 'cold', 'converted', 'lost'];

async function fetchLead(id: string) {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) throw new Error('Failed to fetch lead');
  return res.json();
}

async function fetchNotes(leadId: string) {
  const res = await fetch(`/api/leads/${leadId}/notes`);
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json();
}

async function fetchCallRecordings(leadId: string) {
  const res = await fetch(`/api/leads/${leadId}/call-recordings`);
  if (!res.ok) throw new Error('Failed to fetch call recordings');
  return res.json();
}

async function updateLeadStatus(id: string, status: LeadStatus) {
  const res = await fetch(`/api/leads/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
}

async function deleteLead(id: string) {
  const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete lead');
  return res.json();
}

async function syncLeadWithOdoo(leadId: string, action: 'push' | 'pull' | 'both' = 'both') {
  const res = await fetch(`/api/odoo/sync/${leadId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error('Sync failed');
  return res.json();
}

async function getLeadOdooStatus(leadId: string) {
  const res = await fetch(`/api/odoo/sync/${leadId}`);
  if (!res.ok) throw new Error('Failed to get sync status');
  return res.json();
}

async function createNote(leadId: string, data: CreateNoteInput) {
  const res = await fetch(`/api/leads/${leadId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, lead_id: leadId }),
  });
  if (!res.ok) throw new Error('Failed to create note');
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

  const { data: leadData, isLoading: leadLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => fetchLead(leadId),
  });

  const { data: notesData, isLoading: notesLoading } = useQuery({
    queryKey: ['notes', leadId],
    queryFn: () => fetchNotes(leadId),
  });

  const { data: callRecordingsData, isLoading: callRecordingsLoading } = useQuery({
    queryKey: ['callRecordings', leadId],
    queryFn: () => fetchCallRecordings(leadId),
  });

  const lead: Lead | null = leadData?.data;
  const notes: Note[] = notesData?.data || [];
  const callRecordings: CallRecording[] = callRecordingsData?.data || [];

  const statusMutation = useMutation({
    mutationFn: (status: LeadStatus) => updateLeadStatus(leadId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      router.push('/leads');
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
      queryClient.invalidateQueries({ queryKey: ['notes', leadId] });
      reset();
      setShowNoteForm(false);
    },
  });

  // Odoo Sync Mutation
  const odooSyncMutation = useMutation({
    mutationFn: (action: 'push' | 'pull' | 'both') => syncLeadWithOdoo(leadId, action),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      const pushResult = data.results?.push;
      const pullResult = data.results?.pull;
      let message = 'Sync completed: ';
      if (pushResult?.success) message += pushResult.message + ' ';
      if (pullResult?.success) message += pullResult.message;
      toast.success(message.trim());
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link
            href="/leads"
            className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 mt-1"
          >
            <ArrowLeftIcon className="h-5 w-5 text-slate-500" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {lead.name}
              </h1>
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
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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

      {/* Lead Intelligence Summary - Decision Cockpit */}
      <LeadIntelligenceSummary
        lead={lead}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
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
                  console.error('Audio upload error:', error);
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
                  {...register('text')}
                  rows={4}
                  placeholder="Enter note..."
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {errors.text && (
                  <p className="mt-1 text-sm text-red-500">{errors.text.message}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button type="submit" size="sm" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save Note'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Unified Lead Activity Timeline */}
          <LeadActivityTimeline
            notes={notes}
            callRecordings={callRecordings}
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
          {/* Create Estimate Button */}
          <Card className="p-4">
            <Button
              className="w-full"
              onClick={() => setShowEstimator(true)}
            >
              <CalculatorIcon className="h-4 w-4 mr-2" />
              Create Estimate
            </Button>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
              Generate a price estimate with AI-powered discount suggestions
            </p>
          </Card>

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
                onClick={() => odooSyncMutation.mutate('both')}
                disabled={odooSyncMutation.isPending}
              >
                {odooSyncMutation.isPending ? 'Syncing...' : 'Sync Now'}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => odooSyncMutation.mutate('push')}
                  disabled={odooSyncMutation.isPending}
                >
                  Push to Odoo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => odooSyncMutation.mutate('pull')}
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
                    <dd className="font-medium text-slate-900 dark:text-white">#{lead.odoo_lead_id}</dd>
                  </div>
                  {lead.odoo_quote_number && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Quote</dt>
                      <dd className="font-medium text-emerald-600">{lead.odoo_quote_number}</dd>
                    </div>
                  )}
                  {lead.odoo_order_number && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Order</dt>
                      <dd className="font-medium text-blue-600">{lead.odoo_order_number}</dd>
                    </div>
                  )}
                  {lead.odoo_synced_at && (
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Last Sync</dt>
                      <dd className="text-slate-600 dark:text-slate-400">
                        {new Date(lead.odoo_synced_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
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
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {statusLabels[status]}
                </button>
              ))}
            </div>
          </Card>

          {/* AI Analysis Panel */}
          <AIAnalysisPanel
            lead={lead}
            onAnalysisComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
            }}
          />

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
          Are you sure you want to delete <strong>{lead.name}</strong>? This action cannot be undone.
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
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>

      {/* Price Estimator Panel */}
      <PriceEstimatorPanel
        lead={lead}
        isOpen={showEstimator}
        onClose={() => setShowEstimator(false)}
        onEstimateCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['estimates', leadId] });
        }}
      />
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
    </svg>
  );
}

function OdooIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
    </svg>
  );
}
