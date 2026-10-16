// @vitest-environment node
/**
 * Regression tests for the demand-sync outage of 26-28 Aug 2026, where every
 * nightly run died with Vercel's FUNCTION_INVOCATION_TIMEOUT after 300s and
 * left its run row orphaned as 'running'.
 *
 * The per-call abort timer existed but only covered response HEADERS: it was
 * cleared as soon as fetch() resolved, leaving `response.text()` unbounded, so
 * a stalled body hung forever. These tests pin the fixed behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV = {
  ODOO_URL: "https://odoo.test",
  ODOO_DB: "testdb",
  ODOO_USER: "tester",
  ODOO_PASSWORD: "secret",
};

/** A response whose headers arrive but whose body never does. */
function stalledBodyResponse(signal: AbortSignal): Response {
  return {
    ok: true,
    status: 200,
    text: () =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  } as unknown as Response;
}

const AUTH_XML =
  '<?xml version="1.0"?><methodResponse><params><param><value><int>7</int></value></param></params></methodResponse>';
const EMPTY_ARRAY_XML =
  '<?xml version="1.0"?><methodResponse><params><param><value><array><data></data></array></value></param></params></methodResponse>';

async function loadOdoo() {
  vi.resetModules();
  Object.assign(process.env, ENV);
  return import("../odoo-service");
}

describe("odooXmlRpc timeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts a stalled response BODY, not just slow headers", async () => {
    const { odooExecute } = await loadOdoo();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        // Auth resolves normally; the data call stalls mid-body.
        const body = String(init.body);
        if (body.includes("authenticate")) return new Response(AUTH_XML);
        return stalledBodyResponse(init.signal as AbortSignal);
      }),
    );

    const call = odooExecute("sale.order", "search_read", [[]]);
    const assertion = expect(call).rejects.toThrow(/timed out after 25s/);
    await vi.advanceTimersByTimeAsync(26_000);
    await assertion;
  });

  it("names the HTTP status instead of parsing an error page", async () => {
    const { odooExecute } = await loadOdoo();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) =>
        String(init.body).includes("authenticate")
          ? new Response(AUTH_XML)
          : new Response("<html>502 Bad Gateway</html>", { status: 502 }),
      ),
    );

    await expect(odooExecute("sale.order", "search_read", [[]])).rejects.toThrow(
      /HTTP 502/,
    );
  });

  it("caches the uid so repeated calls stop re-authenticating", async () => {
    const { odooExecute } = await loadOdoo();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      String(init.body).includes("authenticate")
        ? new Response(AUTH_XML)
        : new Response(EMPTY_ARRAY_XML),
    );
    vi.stubGlobal("fetch", fetchMock);

    await odooExecute("sale.order", "search_read", [[]]);
    await odooExecute("sale.order.line", "search_read", [[]]);
    await odooExecute("product.product", "search_read", [[]]);

    const authCalls = fetchMock.mock.calls.filter((c) =>
      String((c[1] as RequestInit).body).includes("authenticate"),
    );
    // One login for three reads — previously three logins, six round trips.
    expect(authCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
