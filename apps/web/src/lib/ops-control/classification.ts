/**
 * Operations Control — Odoo sales-order-line classification.
 *
 * Pure function, no I/O. Decides what an Odoo SO line IS, so that only real
 * product lines become demand. This matters concretely: in production data,
 * service lines like "Loading" (115k units) and "Unloading" (114k) carry
 * brick-sized quantities, and Terms & Conditions prose is stored as a product
 * name. None of it may ever enter the plan.
 *
 * Precedence (each step only if the previous did not decide):
 *   1. Odoo's own display_type says section/note        -> note
 *   2. A manual classification override exists           -> as overridden
 *   3. Odoo says the product's type is 'service'         -> service
 *   4. The product is mapped to a finished good          -> product
 *   5. Otherwise                                         -> unmapped
 *
 * Service BEATS mapping by design: accidentally mapping "Loading" to a brick
 * must not create 115k units of demand. Only a deliberate override (step 2)
 * can promote something Odoo calls a service.
 */

import type { OcLineKind } from "@maiyuri/shared";

export interface ClassifyInput {
  /** Odoo sale.order.line.display_type: 'line_section' | 'line_note' | false/null */
  displayType: string | false | null | undefined;
  /** Odoo product.product.type ('service' is what matters; others vary by version) */
  productType: string | null | undefined;
  /** finished_good_id from oc_product_mapping, if the product is mapped */
  mappedFinishedGoodId: string | null | undefined;
  /** line_kind from oc_product_classification_overrides, if one exists */
  override: OcLineKind | null | undefined;
}

export interface Classification {
  lineKind: OcLineKind;
  isDemand: boolean;
  /** carried through only when the line classifies as product */
  finishedGoodId: string | null;
}

export function classifyLine(input: ClassifyInput): Classification {
  const { displayType, productType, mappedFinishedGoodId, override } = input;

  // 1. Structural rows have no product at all; nothing can override that.
  if (displayType === "line_section" || displayType === "line_note") {
    return { lineKind: "note", isDemand: false, finishedGoodId: null };
  }

  // 2. Explicit human decision.
  if (override) {
    const isProduct = override === "product";
    return {
      lineKind: override,
      isDemand: isProduct,
      finishedGoodId: isProduct ? (mappedFinishedGoodId ?? null) : null,
    };
  }

  // 3. Odoo's product type. Defense in depth against a mis-mapped service.
  if (productType === "service") {
    return { lineKind: "service", isDemand: false, finishedGoodId: null };
  }

  // 4. Mapped physical product = demand.
  if (mappedFinishedGoodId) {
    return { lineKind: "product", isDemand: true, finishedGoodId: mappedFinishedGoodId };
  }

  // 5. Physical-looking but unknown — surfaced, never swallowed.
  return { lineKind: "unmapped", isDemand: false, finishedGoodId: null };
}
