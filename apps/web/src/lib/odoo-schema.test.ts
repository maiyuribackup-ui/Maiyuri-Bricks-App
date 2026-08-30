/**
 * Odoo schema resolution (BUG: the Odoo 19 upgrade renamed
 * sale.order.line.product_uom to product_uom_id, and asking for the old name
 * failed the whole search_read — a column we barely use took the entire
 * demand sync down).
 *
 * These tests pin the behaviour that matters: prefer the modern name, still
 * work against an older instance, fail loudly rather than silently dropping
 * the field, and only ask the server once.
 */

import { describe, it, expect, beforeEach } from "vitest";

const execCalls: { model: string; method: string }[] = [];
let fieldsByModel: Record<string, string[]> = {};

import {
  odooModelFields,
  odooPickField,
  odooRelationLabel,
  resetOdooSchemaCache,
} from "./odoo-service";

/** Stands in for the XML-RPC round trip: answers fields_get from a fixture. */
const exec = async (model: string, method: string) => {
  execCalls.push({ model, method });
  const names = fieldsByModel[model] ?? [];
  return Object.fromEntries(names.map((n) => [n, {}]));
};

beforeEach(() => {
  execCalls.length = 0;
  resetOdooSchemaCache();
});

describe("odooPickField", () => {
  it("prefers the Odoo 19 name when the instance has it", async () => {
    fieldsByModel = { "sale.order.line": ["id", "product_uom_id", "qty_delivered"] };
    await expect(
      odooPickField("sale.order.line", ["product_uom_id", "product_uom"], exec),
    ).resolves.toBe("product_uom_id");
  });

  it("falls back to the pre-19 name on an older instance", async () => {
    fieldsByModel = { "sale.order.line": ["id", "product_uom", "qty_delivered"] };
    await expect(
      odooPickField("sale.order.line", ["product_uom_id", "product_uom"], exec),
    ).resolves.toBe("product_uom");
  });

  it("throws a named error when the schema has moved again", async () => {
    // Silently omitting the field would give a column of nulls nobody
    // notices; the whole point is that this is loud.
    fieldsByModel = { "sale.order.line": ["id", "qty_delivered"] };
    await expect(
      odooPickField("sale.order.line", ["product_uom_id", "product_uom"], exec),
    ).rejects.toThrow(/none of the expected fields/);
  });

  it("asks the server once per model, not once per call", async () => {
    fieldsByModel = { "sale.order.line": ["product_uom_id"] };
    await odooPickField("sale.order.line", ["product_uom_id"], exec);
    await odooPickField("sale.order.line", ["product_uom_id"], exec);
    await odooModelFields("sale.order.line", exec);
    expect(execCalls.filter((c) => c.method === "fields_get")).toHaveLength(1);
  });

  it("caches per model, so a second model is still looked up", async () => {
    fieldsByModel = {
      "sale.order.line": ["product_uom_id"],
      "stock.move": ["product_uom"],
    };
    expect(await odooPickField("sale.order.line", ["product_uom_id", "product_uom"], exec)).toBe(
      "product_uom_id",
    );
    expect(await odooPickField("stock.move", ["product_uom_id", "product_uom"], exec)).toBe(
      "product_uom",
    );
    expect(execCalls.filter((c) => c.method === "fields_get")).toHaveLength(2);
  });
});

describe("odooRelationLabel", () => {
  it("reads the label out of a many2one pair", () => {
    expect(odooRelationLabel({ product_uom_id: [1, "Units"] }, "product_uom_id")).toBe("Units");
  });

  it("returns null for Odoo's false-means-unset", () => {
    // Indexing [1] on `false` is the crash this exists to prevent.
    expect(odooRelationLabel({ product_uom_id: false }, "product_uom_id")).toBeNull();
  });

  it("returns null for a field that is absent entirely", () => {
    expect(odooRelationLabel({}, "product_uom_id")).toBeNull();
  });
});
