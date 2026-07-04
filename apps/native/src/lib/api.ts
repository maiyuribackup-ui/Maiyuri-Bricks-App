import { supabase } from './supabase';

/**
 * Typed client for the Maiyuri Next.js API (the 168 routes under
 * apps/web/app/api). Every route returns the envelope:
 *   { data: T, error: string | null, meta?: { total, page, limit } }
 * (see apps/web/src/lib/api-utils.ts -> apiResponse).
 *
 * We attach the Supabase access token as a Bearer header so routes that check
 * auth can identify the caller.
 */

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://mb.maiyuri.com';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Envelope<T> = {
  data: T;
  error: string | null;
  meta?: { total?: number; page?: number; limit?: number };
};

export type ApiResult<T> = {
  data: T;
  meta?: { total?: number; page?: number; limit?: number };
};

type QueryParams = Record<string, string | number | boolean | undefined | null>;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  opts: { params?: QueryParams; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(await authHeaders()),
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.params), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      // Fail fast instead of spinning forever on a dead network / cold server.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new ApiError('Request timed out — check your connection and retry', 0);
    }
    throw new ApiError(
      e instanceof Error ? e.message : 'Network request failed',
      0,
    );
  }

  // Expired/invalid session: sign out so the auth gate returns the user to
  // the login screen instead of every screen showing raw 401 errors.
  if (res.status === 401) {
    void supabase.auth.signOut();
    throw new ApiError('Session expired — please sign in again', 401);
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // Non-JSON response (e.g. an HTML error page from the host).
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
    throw new ApiError('Unexpected non-JSON response', res.status);
  }

  if (!res.ok || (json && json.error)) {
    throw new ApiError(json?.error ?? `Request failed (${res.status})`, res.status);
  }

  return { data: json.data, meta: json.meta };
}

export const api = {
  get: <T>(path: string, params?: QueryParams) =>
    request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
