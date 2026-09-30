import { create } from 'zustand';

/** Global open/close state for the native left navigation drawer. */
type DrawerState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useDrawer = create<DrawerState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
