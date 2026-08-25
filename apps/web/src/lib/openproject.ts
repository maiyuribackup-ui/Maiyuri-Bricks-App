/**
 * OpenProject API v3 client — the founder's project-planning cockpit
 * (Gantt/dependencies at op.maiyuri.com) bridged to My Work (the staff
 * execution queue on phones).
 *
 * Env (Vercel):
 *   OPENPROJECT_URL      e.g. https://op.maiyuri.com
 *   OPENPROJECT_API_KEY  personal access token (My account → Access tokens)
 *
 * Auth is HTTP Basic with the literal username "apikey".
 *
 * IMPORTANT: OpenProject is self-hosted behind a Cloudflare tunnel on a PC
 * that is not always on. Callers must treat network failure as a NORMAL
 * state (skip, don't alert) — see isUnreachableError().
 */

const OP_URL = process.env.OPENPROJECT_URL?.replace(/\/$/, "");
const OP_KEY = process.env.OPENPROJECT_API_KEY;

export function isOpenProjectConfigured(): boolean {
  return Boolean(OP_URL && OP_KEY);
}

export class OpenProjectUnreachable extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "OpenProjectUnreachable";
  }
}

export function isUnreachableError(err: unknown): boolean {
  return (
    err instanceof OpenProjectUnreachable ||
    (err instanceof Error &&
      /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|aborted|network|502|503|521|522|530/i.test(
        err.message,
      ))
  );
}

async function opFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!OP_URL || !OP_KEY) throw new Error("OpenProject not configured");
  const auth = Buffer.from(`apikey:${OP_KEY}`).toString("base64");

  // Short timeout: when the tunnel host is asleep Cloudflare hangs then 5xxs;
  // fail fast so the 30-min sync doesn't burn its runtime.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${OP_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new OpenProjectUnreachable(
      err instanceof Error ? err.message : "network error",
    );
  } finally {
    clearTimeout(timer);
  }
  // Cloudflare's tunnel-offline pages are 5xx with HTML bodies.
  if (res.status >= 502) {
    throw new OpenProjectUnreachable(`OpenProject gateway ${res.status}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenProject ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- types

export interface OpWorkPackage {
  id: number;
  lockVersion: number;
  subject: string;
  dueDate: string | null; // YYYY-MM-DD
  description?: { raw?: string | null };
  _links: {
    status: { href: string; title?: string };
    assignee?: { href: string | null; title?: string } | null;
    project: { href: string; title?: string };
    priority?: { href: string; title?: string };
  };
}

interface OpCollection<T> {
  total: number;
  _embedded: { elements: T[] };
}

export interface OpStatus {
  id: number;
  name: string;
  isClosed: boolean;
  _links: { self: { href: string } };
}

// ---------------------------------------------------------------- reads

/**
 * All OPEN work packages that have an assignee, across projects.
 * (operator "o" = open statuses; "!*" would be unassigned — we require one.)
 */
export async function fetchOpenAssignedWorkPackages(): Promise<OpWorkPackage[]> {
  const filters = encodeURIComponent(
    JSON.stringify([
      { status: { operator: "o", values: [] } },
      { assignee: { operator: "*", values: [] } },
    ]),
  );
  const data = await opFetch<OpCollection<OpWorkPackage>>(
    `/api/v3/work_packages?filters=${filters}&pageSize=200`,
  );
  return data._embedded.elements;
}

/** Resolve an assignee href (/api/v3/users/N) to the user's email. Cached per call site. */
export async function fetchUserEmail(userHref: string): Promise<string | null> {
  try {
    const u = await opFetch<{ email?: string | null; login?: string | null }>(
      userHref,
    );
    return u.email ?? null;
  } catch (err) {
    if (isUnreachableError(err)) throw err;
    return null; // e.g. hidden email — skip this assignee
  }
}

/** First closed status (usually "Closed") — used to complete work packages. */
export async function fetchClosedStatusHref(): Promise<string | null> {
  const data = await opFetch<OpCollection<OpStatus>>(`/api/v3/statuses`);
  const closed = data._embedded.elements.find((s) => s.isClosed);
  return closed?._links.self.href ?? null;
}

// ---------------------------------------------------------------- writes

/** Close a work package (status → closed) with optimistic locking. */
export async function closeWorkPackage(
  wpId: number,
  lockVersion: number,
  closedStatusHref: string,
): Promise<void> {
  await opFetch(`/api/v3/work_packages/${wpId}`, {
    method: "PATCH",
    body: JSON.stringify({
      lockVersion,
      _links: { status: { href: closedStatusHref } },
    }),
  });
}

/** Comment on a work package (activity journal). */
export async function commentOnWorkPackage(
  wpId: number,
  text: string,
): Promise<void> {
  await opFetch(`/api/v3/work_packages/${wpId}/activities`, {
    method: "POST",
    body: JSON.stringify({ comment: { raw: text } }),
  });
}
