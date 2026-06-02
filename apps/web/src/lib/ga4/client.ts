/**
 * GA4 Data API client (Phase 3 — Website Behaviour).
 *
 * Reads the maiyuri.com GA4 property server-side via a service account, using
 * the `googleapis` dependency already in the app (no extra package needed).
 *
 * Configured via two env vars:
 *   - GA4_PROPERTY_ID          numeric property id, e.g. "410138430"
 *   - GA4_SERVICE_ACCOUNT_JSON full service-account key JSON (string)
 *
 * Everything degrades gracefully: when the env is absent the route returns
 * { configured: false } instead of throwing, so the feature can ship before
 * the credential is provisioned.
 */
import { google } from "googleapis";

const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

// The high-intent website events we care about (must match what the brochure
// site / GA4 is configured to send). Unknown events simply won't appear.
export const KEY_EVENT_NAMES = [
  "whatsapp_click",
  "call_click",
  "cost_calculator_started",
  "cost_calculator_completed",
  "brochure_downloaded",
  "factory_visit_cta_clicked",
  "google_map_clicked",
  "quote_request_submitted",
] as const;

export interface WebsiteAnalytics {
  configured: true;
  rangeDays: number;
  totals: {
    activeUsers: number;
    sessions: number;
    pageViews: number;
    engagementRate: number; // 0..1
  };
  timeseries: { date: string; users: number }[];
  channels: { channel: string; sessions: number; share: number }[];
  topPages: { path: string; title: string; views: number }[];
  keyEvents: { event: string; count: number }[];
}

export interface WebsiteAnalyticsUnconfigured {
  configured: false;
  reason: string;
}

export function isGa4Configured(): boolean {
  return Boolean(
    process.env.GA4_PROPERTY_ID && process.env.GA4_SERVICE_ACCOUNT_JSON,
  );
}

function getClient() {
  const propertyId = process.env.GA4_PROPERTY_ID!;
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON!;
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("GA4_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error(
      "GA4_SERVICE_ACCOUNT_JSON missing client_email / private_key",
    );
  }
  const auth = new google.auth.JWT({
    email: creds.client_email,
    // Env-stored keys often have escaped newlines — normalize to real ones.
    key: creds.private_key.replace(/\\n/g, "\n"),
    scopes: [ANALYTICS_SCOPE],
  });
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
  return { analyticsdata, property: `properties/${propertyId}` };
}

const num = (v: string | null | undefined) => Number(v ?? 0) || 0;

/**
 * Fetch the Website Behaviour dataset for the dashboard. Throws only on a
 * genuine API/auth failure; callers should guard with isGa4Configured() first.
 */
export async function getWebsiteAnalytics(
  rangeDays = 28,
): Promise<WebsiteAnalytics> {
  const { analyticsdata, property } = getClient();
  const dateRanges = [{ startDate: `${rangeDays}daysAgo`, endDate: "today" }];

  const [totalsRes, tsRes, channelsRes, pagesRes, eventsRes] =
    await Promise.all([
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges,
          metrics: [
            { name: "activeUsers" },
            { name: "sessions" },
            { name: "screenPageViews" },
            { name: "engagementRate" },
          ],
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges,
          dimensions: [{ name: "date" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ dimension: { dimensionName: "date" } }],
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges,
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges,
          dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: "10",
        },
      }),
      analyticsdata.properties.runReport({
        property,
        requestBody: {
          dateRanges,
          dimensions: [{ name: "eventName" }],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              inListFilter: { values: [...KEY_EVENT_NAMES] },
            },
          },
          orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        },
      }),
    ]);

  const t = totalsRes.data.rows?.[0]?.metricValues ?? [];
  const totals = {
    activeUsers: num(t[0]?.value),
    sessions: num(t[1]?.value),
    pageViews: num(t[2]?.value),
    engagementRate: num(t[3]?.value),
  };

  const timeseries = (tsRes.data.rows ?? []).map((r) => {
    const d = r.dimensionValues?.[0]?.value ?? ""; // YYYYMMDD
    const date =
      d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
    return { date, users: num(r.metricValues?.[0]?.value) };
  });

  const channelRows = channelsRes.data.rows ?? [];
  const channelTotal =
    channelRows.reduce((s, r) => s + num(r.metricValues?.[0]?.value), 0) || 1;
  const channels = channelRows.map((r) => {
    const sessions = num(r.metricValues?.[0]?.value);
    return {
      channel: r.dimensionValues?.[0]?.value ?? "Unknown",
      sessions,
      share: Math.round((sessions / channelTotal) * 100),
    };
  });

  const topPages = (pagesRes.data.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? "",
    title: r.dimensionValues?.[1]?.value ?? "",
    views: num(r.metricValues?.[0]?.value),
  }));

  const keyEvents = (eventsRes.data.rows ?? []).map((r) => ({
    event: r.dimensionValues?.[0]?.value ?? "",
    count: num(r.metricValues?.[0]?.value),
  }));

  return {
    configured: true,
    rangeDays,
    totals,
    timeseries,
    channels,
    topPages,
    keyEvents,
  };
}
