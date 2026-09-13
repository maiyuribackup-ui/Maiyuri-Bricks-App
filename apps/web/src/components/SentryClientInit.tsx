"use client";

/**
 * Browser-side Sentry init, mounted once from the root layout. We initialise
 * manually (instead of withSentryConfig's injected sentry.client.config)
 * to keep next.config.mjs untouched apart from the instrumentation hook.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

const DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  "https://be19ee314aba1b6d9e11948bc5fbea44@o4511721437659136.ingest.de.sentry.io/4511721451159632";

let initialised = false;

export function SentryClientInit() {
  useEffect(() => {
    if (initialised || process.env.NODE_ENV !== "production") return;
    initialised = true;
    Sentry.init({
      dsn: DSN,
      environment: "production",
      tracesSampleRate: 0.1,
      replaysOnErrorSampleRate: 0, // keep the bundle lean — no replay
    });
  }, []);
  return null;
}
