import * as Updates from 'expo-updates';
import { toast } from '@/lib/toast';

/**
 * OTA update check (expo-updates / EAS Update). Old sideloaded APKs used to
 * linger forever with no nudge (audit #6). JS-level changes now reach every
 * installed device on next launch; only native-module changes still need a
 * fresh APK.
 *
 * No-ops in dev and in builds without an update URL configured.
 */
export async function checkForAppUpdate(): Promise<void> {
  try {
    if (__DEV__ || !Updates.isEnabled) return;
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    toast.info('Updating the app…');
    await Updates.fetchUpdateAsync();
    // Small pause so the toast is visible before the reload.
    setTimeout(() => {
      void Updates.reloadAsync();
    }, 1200);
  } catch (err) {
    // Never let update-checking break app startup.
    console.warn('App update check failed:', err);
  }
}
