import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';

type ToastState = {
  message: string | null;
  kind: ToastKind;
  /** Monotonic id so re-firing the same message re-triggers the animation. */
  seq: number;
  show: (message: string, kind?: ToastKind) => void;
  clear: () => void;
};

/**
 * App-wide lightweight toast. Use for confirming that a write succeeded
 * (the "did it actually save?" gap) — NOT a substitute for inline field
 * validation. Rendered by <ToastHost/> mounted once in the root layout.
 */
export const useToast = create<ToastState>((set) => ({
  message: null,
  kind: 'success',
  seq: 0,
  show: (message, kind = 'success') =>
    set((s) => ({ message, kind, seq: s.seq + 1 })),
  clear: () => set({ message: null }),
}));

/** Imperative helpers so non-component code can toast too. */
export const toast = {
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (m: string) => useToast.getState().show(m, 'error'),
  info: (m: string) => useToast.getState().show(m, 'info'),
};
