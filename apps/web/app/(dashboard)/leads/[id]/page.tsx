'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, Button, Badge, Spinner, Modal } from '@maiyuri/ui';
import { createNoteSchema, type CreateNoteInput, type Lead, type Note, type LeadStatus } from '@maiyuri/shared';
import { AIAnalysisPanel, AudioUpload } from '@/components/leads';
import Link from 'next/link';

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

  const { data: leadData, isLoading: leadLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => fetchLead(leadId),
  });

  const { data: notesData, isLoading: notesLoading } = useQuery({
    queryKey: ['notes', leadId],
    queryFn: () => fetchNotes(leadId),
  });

  const lead: Lead | null = leadData?.data;
  const notes: Note[] = notesData?.data || [];

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes Section */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Notes & Interactions
              </h2>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setShowAudioUpload(!showAudioUpload);
                    setShowNoteForm(false);
                  }}
                >
                  <MicrophoneIcon className="h-4 w-4 mr-1" />
                  {showAudioUpload ? 'Cancel' : 'Audio'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setShowNoteForm(!showNoteForm);
                    setShowAudioUpload(false);
                  }}
                >
                  {showNoteForm ? 'Cancel' : 'Add Note'}
                </Button>
              </div>
            </div>

            {/* Audio Upload Section */}
            {showAudioUpload && (
              <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
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
              </div>
            )}

            {/* Add Note Form */}
            {showNoteForm && (
              <form
                onSubmit={handleSubmit((data) => noteMutation.mutate(data))}
                className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg"
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
            )}

            {/* Notes Timeline */}
            {notesLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-center py-8 text-slate-500">
                No notes yet. Add your first note above.
              </p>
            ) : (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="border-l-2 border-slate-200 dark:border-slate-700 pl-4 pb-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-slate-500">
                        {new Date(note.date).toLocaleDateString()}
                      </span>
                      {note.confidence_score && (
                        <Badge
                          variant={
                            note.confidence_score >= 0.7 ? 'success' :
                            note.confidence_score >= 0.4 ? 'warning' : 'danger'
                          }
                        >
                          {Math.round(note.confidence_score * 100)}% confidence
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {note.text}
                    </p>
                    {note.ai_summary && (
                      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-blue-700 dark:text-blue-300">
                        <strong>AI Summary:</strong> {note.ai_summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}
