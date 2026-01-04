import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import type { User } from '@maiyuri/shared';

async function fetchCurrentUser(): Promise<{ data: User | null }> {
  const res = await fetch('/api/users/me');
  if (!res.ok) {
    if (res.status === 401) {
      return { data: null };
    }
    throw new Error('Failed to fetch user');
  }
  return res.json();
}

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } = useAuthStore();

  const { data, isLoading: queryLoading, error } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  useEffect(() => {
    if (!queryLoading) {
      if (data?.data) {
        setUser(data.data);
      } else {
        setUser(null);
      }
    }
  }, [data, queryLoading, setUser]);

  useEffect(() => {
    setLoading(queryLoading);
  }, [queryLoading, setLoading]);

  return {
    user,
    isAuthenticated,
    isLoading: isLoading || queryLoading,
    error,
    logout,
  };
}

export function useRequireAuth() {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      // Redirect to login
      window.location.href = '/login';
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  return auth;
}
