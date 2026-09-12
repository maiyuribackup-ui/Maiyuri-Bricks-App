import { describe, it, expect } from "vitest";
import { classifyLine } from "./classification";

const FG = "11111111-1111-1111-1111-111111111111";

describe("classifyLine — real production shapes", () => {
  it("classifies a mapped brick line as product demand", () => {
    // MIB-10*8*5, odoo product 12, mapped
    expect(
      classifyLine({ displayType: false, productType: "product", mappedFinishedGoodId: FG, override: null }),
    ).toEqual({ lineKind: "product", isDemand: true, finishedGoodId: FG });
  });

  it("keeps 'Loading' (service, 115k units in prod) OUT of demand", () => {
    expect(
      classifyLine({ displayType: false, productType: "service", mappedFinishedGoodId: null, override: null }),
    ).toEqual({ lineKind: "service", isDemand: false, finishedGoodId: null });
  });

  it("service BEATS mapping — a mis-mapped 'Loading' still cannot become demand", () => {
    // The trap the precedence exists for: someone maps Loading to a brick.
    const result = classifyLine({
      displayType: false,
      productType: "service",
      mappedFinishedGoodId: FG,
      override: null,
    });
    expect(result.lineKind).toBe("service");
    expect(result.isDemand).toBe(false);
  });

  it("only an explicit override can promote a service to demand", () => {
    const result = classifyLine({
      displayType: false,
      productType: "service",
      mappedFinishedGoodId: FG,
      override: "product",
    });
    expect(result).toEqual({ lineKind: "product", isDemand: true, finishedGoodId: FG });
  });

  it("classifies Terms & Conditions prose (Odoo line_note) as note, overriding everything", () => {
    // Prod really stores T&C paragraphs as lines; display_type is structural.
    expect(
      classifyLine({ displayType: "line_note", productType: "service", mappedFinishedGoodId: FG, override: "product" }),
    ).toEqual({ lineKind: "note", isDemand: false, finishedGoodId: null });
    expect(
      classifyLine({ displayType: "line_section", productType: null, mappedFinishedGoodId: null, override: null }),
    ).toEqual({ lineKind: "note", isDemand: false, finishedGoodId: null });
  });

  it("surfaces an unmapped physical product instead of swallowing it", () => {
    // CIB-10*8*5-Single Press: 992 real open units, invisible until mapped.
    expect(
      classifyLine({ displayType: null, productType: "product", mappedFinishedGoodId: null, override: null }),
    ).toEqual({ lineKind: "unmapped", isDemand: false, finishedGoodId: null });
  });

  it("an override to service demotes a mapped product", () => {
    const result = classifyLine({
      displayType: false,
      productType: "product",
      mappedFinishedGoodId: FG,
      override: "service",
    });
    expect(result.isDemand).toBe(false);
    expect(result.finishedGoodId).toBeNull();
  });

  it("treats Odoo 17-style 'consu' as physical", () => {
    expect(
      classifyLine({ displayType: false, productType: "consu", mappedFinishedGoodId: FG, override: null }).lineKind,
    ).toBe("product");
  });
});
