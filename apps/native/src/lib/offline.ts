/**
 * Offline awareness. Wires TanStack Query's onlineManager to real device
 * connectivity (NetInfo) so mutations fired while offline PAUSE (instead of
 * instantly failing) and auto-resume when the network returns — the fix for
 * drivers losing "Mark Delivered" in the brick yard (audit #2).
 */
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

let wired = false;

/** Call once at app startup (root layout). */
export function initOnlineManager(): void {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    }),
  );
}

/** Live boolean for UI (offline banner, queued-save messaging). */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}
