import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Mobile client for the coaching module ("Training" in OneHub).
 * Same endpoints the web /coaching pages use — Bearer-compatible.
 */

export type TrainingModule = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  role_applicability: string[];
  difficulty: string;
  estimated_minutes: number;
  sequence_order: number;
  is_required: boolean;
};

export type TrainingLesson = {
  id: string;
  title: string;
  objective?: string | null;
  content: string;
  examples?: string | null;
  do_dont_notes?: string | null;
  estimated_minutes: number;
  sequence_order: number;
  completed?: boolean;
};

export function useTrainingModules() {
  return useQuery({
    queryKey: ['training', 'modules'],
    queryFn: () => api.get<TrainingModule[]>('/api/coaching/modules'),
  });
}

export function useTrainingModule(id: string | null) {
  return useQuery({
    queryKey: ['training', 'module', id],
    queryFn: () =>
      api.get<{ module: TrainingModule; lessons: TrainingLesson[] }>(
        `/api/coaching/modules/${id}`,
      ),
    enabled: !!id,
  });
}

export function useCompleteLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) =>
      api.post(`/api/coaching/lessons/${lessonId}/complete`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['training'] }),
  });
}
