import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, LanguagePreference } from '@maiyuri/shared';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Computed getters
  languagePreference: LanguagePreference;

  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLanguagePreference: (preference: LanguagePreference) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Default to English, updated when user is set
      get languagePreference(): LanguagePreference {
        return get().user?.language_preference || 'en';
      },

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
          error: null,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, isLoading: false }),

      setLanguagePreference: (preference) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: { ...currentUser, language_preference: preference },
          });
        }
      },

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        }),
    }),
    {
      name: 'maiyuri-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
