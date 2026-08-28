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
