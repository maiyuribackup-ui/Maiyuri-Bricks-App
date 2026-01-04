import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Note, CreateNoteInput } from '@maiyuri/shared';

interface NotesResponse {
  data: Note[];
  meta?: {
    total: number;
  };
}

async function fetchNotes(leadId?: string): Promise<NotesResponse> {
  const url = leadId ? `/api/leads/${leadId}/notes` : '/api/notes';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json();
}

async function fetchNote(id: string): Promise<{ data: Note }> {
  const res = await fetch(`/api/notes/${id}`);
  if (!res.ok) throw new Error('Failed to fetch note');
  return res.json();
}

async function createNote(data: CreateNoteInput): Promise<{ data: Note }> {
  const res = await fetch(`/api/leads/${data.lead_id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create note');
  }
  return res.json();
}

async function updateNote(id: string, data: Partial<Note>): Promise<{ data: Note }> {
  const res = await fetch(`/api/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update note');
  }
  return res.json();
}

async function deleteNote(id: string): Promise<void> {
  const res = await fetch(`/api/notes/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete note');
}

export function useNotes(leadId?: string) {
  return useQuery({
    queryKey: leadId ? ['notes', leadId] : ['notes'],
    queryFn: () => fetchNotes(leadId),
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: ['note', id],
    queryFn: () => fetchNote(id),
    enabled: !!id,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createNote,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['notes', variables.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['lead', variables.lead_id] });
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Note> }) =>
      updateNote(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}
