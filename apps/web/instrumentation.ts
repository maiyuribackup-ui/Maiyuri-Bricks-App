/**
 * Server-side Sentry init (Node + Edge runtimes). Loaded by Next.js via the
 * instrumentation hook (enabled in next.config.mjs). DSNs are publishable
 * client keys — safe to keep in code; env var overrides if ever needed.
 */
import * as Sentry from "@sentry/nextjs";

const DSN =
  process.env.SENTRY_DSN ??
  "https://be19ee314aba1b6d9e11948bc5fbea44@o4511721437659136.ingest.de.sentry.io/4511721451159632";

export function register() {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // API routes log a lot via console.error already — capture exceptions only.
    enabled: process.env.NODE_ENV === "production",
  });
}

export const onRequestError = Sentry.captureRequestError;
