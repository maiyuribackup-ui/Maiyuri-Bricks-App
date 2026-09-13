/**
 * Thin, safe wrappers over expo-haptics. Every call is fire-and-forget and
 * never throws (haptics are unavailable on some devices/emulators). Use these
 * so the whole app has one consistent tactile language.
 */
import * as Haptics from 'expo-haptics';

export const haptic = {
  /** A light tap — primary buttons, selection, chip toggles. */
  tap: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** A firmer tap — significant / destructive confirmations. */
  press: () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  /** Success buzz — a mutation completed. */
  success: () => {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  },
  /** Warning/error buzz — a mutation failed or validation blocked. */
  error: () => {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
  },
};
