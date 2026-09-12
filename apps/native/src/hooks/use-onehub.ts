import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useMyProfile } from '@/hooks/use-push-settings';

export type SopStep = { en: string; ta?: string; icon?: string };

export type Sop = {
  id: string;
  department: 'sales' | 'production' | 'dispatch' | 'accounts' | 'hr' | 'safety';
  slug: string;
  title_en: string;
  title_ta: string | null;
  purpose_en: string | null;
  purpose_ta: string | null;
  steps: SopStep[];
  warning_en: string | null;
  warning_ta: string | null;
  video_url: string | null;
  version: number;
  status: 'draft' | 'published';
  updated_at: string;
};

export type OneHubLink = {
  id: string;
  category: string;
  name: string;
  purpose: string | null;
  url: string;
  sort_order: number;
  updated_at: string;
};

export type ChecklistTemplate = {
  id: string;
  name: string;
  phases: { phase: string; items: { id: string; text: string; owner_role: string }[] }[];
};

export type ChecklistRun = {
  id: string;
  template_id: string;
  subject_name: string;
  statuses: Record<string, { done: boolean; by: string; at: string }>;
  started_at: string;
  completed_at: string | null;
};

export function useSops(department?: string) {
  return useQuery({
    queryKey: ['onehub', 'sops', department ?? 'all'],
    queryFn: () => api.get<Sop[]>('/api/onehub/sops', department ? { department } : undefined),
  });
}

export function useSaveSop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Sop>) => api.post<Sop>('/api/onehub/sops', body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['onehub', 'sops'] }),
  });
}

/** True when the signed-in user may create/edit SOPs and links. */
export function useCanEdit(): boolean {
  const userId = useAuth((s) => s.session?.user?.id);
  const profile = useMyProfile(userId);
  const role = profile.data?.data.role ?? '';
  return role === 'founder' || role === 'owner';
}

export function useOneHubLinks() {
  return useQuery({
    queryKey: ['onehub', 'links'],
    queryFn: () => api.get<OneHubLink[]>('/api/onehub/links'),
  });
}

export function useChecklists() {
  return useQuery({
    queryKey: ['onehub', 'checklists'],
    queryFn: () =>
      api.get<{ templates: ChecklistTemplate[]; runs: ChecklistRun[] }>(
        '/api/onehub/checklists',
      ),
  });
}

export function useStartChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { template_id: string; subject_name: string }) =>
      api.post<ChecklistRun>('/api/onehub/checklists', body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['onehub', 'checklists'] }),
  });
}

export function useTickChecklist(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { item_id: string; done: boolean }) =>
      api.patch<ChecklistRun>(`/api/onehub/checklists/runs/${runId}`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['onehub', 'checklists'] }),
  });
}

export type AskAnswer = {
  answer: string;
  sources: { content: string; sourceType: string; score: number }[];
  confidence: number;
};

/** Ask Mayur — thin client over the existing RAG endpoint (Tamil-capable). */
export function useAskMayur() {
  return useMutation({
    mutationFn: (body: { question: string; language: 'en' | 'ta' }) =>
      api.post<AskAnswer>('/api/knowledge/ask', {
        question: body.question,
        language: body.language,
        maxSources: 4,
      }),
  });
}
