import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

type PushStatus = { configured: boolean; deviceCount: number };
type TestResult = { configured: boolean; sent: number; failed: number };

type UserProfile = {
  id: string;
  name?: string | null;
  role?: string | null;
  notification_preferences?: Record<string, boolean> | null;
  language_preference?: string | null;
};

/** GET /api/push/test — is FCM configured + how many devices I registered. */
export function usePushStatus() {
  return useQuery({
    queryKey: ['push-status'],
    queryFn: () => api.get<PushStatus>('/api/push/test'),
  });
}

/** POST /api/push/test — fire a test notification at my own devices. */
export function useSendTestPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<TestResult>('/api/push/test'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['push-status'] }),
  });
}

/** GET /api/users/:id — profile incl. notification_preferences. */
export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => api.get<UserProfile>(`/api/users/${userId}`),
    enabled: !!userId,
  });
}

/** PATCH /api/users/:id { notification_preferences } (self-service field). */
export function useUpdatePrefs(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notification_preferences: Record<string, boolean>) =>
      api.patch(`/api/users/${userId}`, { notification_preferences }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  });
}
