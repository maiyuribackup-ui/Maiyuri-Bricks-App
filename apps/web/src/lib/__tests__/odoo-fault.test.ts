import { describe, it, expect } from "vitest";
import { summarizeOdooFault } from "../odoo-service";

// Real fault from odoo.maiyuri.com on 2026-08-28, abridged: the operator saw
// ~2,000 characters of /opt/odoo19 stack frames and had to hunt for the cause.
const REAL_TRACEBACK = `Traceback (most recent call last):
  File "/opt/odoo19/odoo/orm/registry.py", line 118, in __new__
    return cls.registries[db_name]
KeyError: 'lite2'
During handling of the above exception, another exception occurred:
  File "/opt/odoo19/odoo/sql_db.py", line 680, in borrow
    result = psycopg2.connect(dsn)
psycopg2.OperationalError: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: FATAL:  database "lite2" does not exist`;

describe("summarizeOdooFault", () => {
  it("surfaces the real cause, not the first frame", () => {
    const summary = summarizeOdooFault(REAL_TRACEBACK);
    expect(summary).toContain('database "lite2" does not exist');
    expect(summary).not.toContain("Traceback");
    expect(summary).not.toContain("/opt/odoo19");
  });

  it("keeps the message short enough to read in a banner or alert", () => {
    expect(summarizeOdooFault(REAL_TRACEBACK).length).toBeLessThanOrEqual(300);
    expect(summarizeOdooFault("x".repeat(500))).toHaveLength(300);
  });

  it("handles a plain one-line fault unchanged", () => {
    expect(summarizeOdooFault("Access Denied")).toBe("Access Denied");
  });

  it("never returns empty for junk input", () => {
    expect(summarizeOdooFault("")).toBe("Unknown error");
    expect(summarizeOdooFault("\n  \n")).toBe("Unknown error");
  });
});

// ---------------------------------------------------------------------------
// Unknown-database diagnostics: a wrong ODOO_DB should answer its own question.
// ---------------------------------------------------------------------------

import { vi, beforeEach, afterEach } from "vitest";

const DB_FAULT_XML = `<?xml version="1.0"?><methodResponse><fault><value><struct>
<member><name>faultCode</name><value><int>1</int></value></member>
<member><name>faultString</name><value><string>Traceback (most recent call last):
KeyError: 'lite2'
psycopg2.OperationalError: FATAL:  database "lite2" does not exist</string></value></member>
</struct></value></fault></methodResponse>`;

const dbListXml = (names: string[]) =>
  `<?xml version="1.0"?><methodResponse><params><param><value><array><data>${names
    .map((n) => `<value><string>${n}</string></value>`)
    .join("")}</data></array></value></param></params></methodResponse>`;

async function loadService() {
  vi.resetModules();
  Object.assign(process.env, {
    ODOO_URL: "https://odoo.test",
    ODOO_DB: "lite2",
    ODOO_USER: "tester",
    ODOO_PASSWORD: "secret",
  });
  return import("../odoo-service");
}

describe("unknown ODOO_DB", () => {
  afterEach(() => vi.restoreAllMocks());

  it("names the databases the server actually serves", async () => {
    const { odooExecute } = await loadService();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = String(init.body);
        if (body.includes("authenticate")) return new Response(DB_FAULT_XML);
        if (body.includes("<methodName>list</methodName>"))
          return new Response(dbListXml(["maiyuri19", "test19"]));
        return new Response(dbListXml([]));
      }),
    );

    await expect(odooExecute("sale.order", "search_read", [[]])).rejects.toThrow(
      /database "lite2" was rejected.*ODOO_DB.*maiyuri19, test19/s,
    );
  });

  it("says so plainly when the server will not list databases", async () => {
    const { odooExecute } = await loadService();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) =>
        String(init.body).includes("authenticate")
          ? new Response(DB_FAULT_XML)
          : new Response("<html>403</html>", { status: 403 }),
      ),
    );

    await expect(odooExecute("sale.order", "search_read", [[]])).rejects.toThrow(
      /list_db may be disabled/,
    );
  });
});
