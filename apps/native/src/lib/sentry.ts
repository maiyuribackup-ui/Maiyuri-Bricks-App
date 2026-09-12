import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/**
 * Crash + error reporting. Fully no-ops until EXPO_PUBLIC_SENTRY_DSN is set,
 * so the app behaves identically in local/dev builds without a DSN.
 *
 * To enable: create a Sentry project (React Native), then set
 * EXPO_PUBLIC_SENTRY_DSN in eas.json's build env (and .env for local dev).
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = !!DSN;

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    // Release/dist tie a crash to a specific build so we can tell which APK
    // a user is on.
    release: Constants.expoConfig?.version ?? 'unknown',
    dist: String(
      Constants.expoConfig?.android?.versionCode ??
        Constants.expoConfig?.runtimeVersion ??
        '1',
    ),
    environment: __DEV__ ? 'development' : 'production',
    // Sample a slice of transactions for performance; full error capture.
    tracesSampleRate: 0.2,
    // Don't spam Sentry from local dev runs.
    enabled: !__DEV__,
    attachStacktrace: true,
  });
}

/**
 * Report a handled error (e.g. an API failure) with context, without
 * crashing. Safe to call even when Sentry is disabled.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Tag the current user on the scope so crashes are attributable. */
export function setSentryUser(user: { id: string; email?: string | null } | null): void {
  if (!DSN) return;
  Sentry.setUser(user ? { id: user.id, email: user.email ?? undefined } : null);
}

export { Sentry };
