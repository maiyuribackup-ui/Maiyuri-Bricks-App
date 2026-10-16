import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  /** True until the initial getSession() has resolved. */
  initializing: boolean;
  setSession: (session: Session | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  session: null,
  initializing: true,
  setSession: (session) => set({ session, initializing: false }),
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    set({ session: data.session });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null });
  },
}));

/**
 * Wire Supabase auth events into the store. Call once at app startup.
 * Returns an unsubscribe function.
 */
export function initAuthListener(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useAuth.getState().setSession(data.session);
  });

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.getState().setSession(session);
  });

  return () => sub.subscription.unsubscribe();
}
