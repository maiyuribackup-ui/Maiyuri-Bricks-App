/**
 * Turn a stored Smart Quote into the facts a quotation document prints.
 *
 * Kept separate from the PDF component and the route so the rules that matter
 * — which price is authoritative, what may be omitted, what must never be
 * invented — are plain functions with tests, not something you can only check
 * by opening a PDF.
 *
 * The single non-negotiable: the engineer's rate is the price. Nothing here
 * consults the rate card, `products.base_price` or a transport formula. If the
 * engineer has not set a rate, there is no document.
 */

import { getQuoteReadiness } from "@/lib/pricing/quote-readiness";
import { computeWallComparison } from "@/lib/pricing/wall-cost";
import type {
  BankDetails,
  NextStepBlock,
  ObjectionBlock,
  QuoteDocumentData,
  WallCostBlock,
} from "./QuoteDocument";
import type {
  SmartQuoteCopyMap,
  SmartQuotePricingConfig,
  WallCostConfig,
} from "@maiyuri/shared";

export interface QuoteDocumentSources {
  quote: {
    quote_number?: string | null;
    valid_until?: string | null;
    created_at: string;
    pricing_config?: Partial<SmartQuotePricingConfig> | null;
  };
  lead: {
    name?: string | null;
    contact?: string | null;
    site_location?: string | null;
    site_region?: string | null;
  } | null;
  factory: {
    name?: string | null;
    legal_name?: string | null;
    gstin?: string | null;
    registered_address?: string | null;
    address?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    website?: string | null;
    payment_terms?: string | null;
    delivery_terms?: string | null;
    additional_terms?: string | null;
    tax_note?: string | null;
    bank_account_name?: string | null;
    bank_account_number?: string | null;
    bank_ifsc?: string | null;
    bank_name?: string | null;
    bank_branch?: string | null;
    upi_number?: string | null;
    quote_footer_note?: string | null;
  } | null;
  /** The quoted product, resolved from `pricing_config.default_product`. */
  product: {
    name?: string | null;
    unit?: string | null;
    hsn_code?: string | null;
  } | null;
  /** The staff member who owns the lead — signs the quotation. */
  rep: { name?: string | null; phone?: string | null } | null;
  /** Per-quote snapshot of the founder's build costs, for page 2. */
  wallCostConfig?: WallCostConfig | null;
  /** AI copy from the call. English only — see buildArgument(). */
  copyMap?: SmartQuoteCopyMap | null;
}

export interface QuoteDocumentResult {
  /** Null when the quote is not printable; `reason` says why. */
  data: QuoteDocumentData | null;
  reason: string | null;
}

/** Blank strings are as absent as null — neither may reach the document. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** One term per line, blank lines dropped. */
function splitLines(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    // The business's existing terms are already numbered ("1.Payment : ...").
    // The document numbers them itself, so strip any leading numbering rather
    // than printing "1. 1.Payment".
    .map((line) => line.replace(/^\d+\s*[.)]\s*/, ""))
    .filter(Boolean);
}

/**
 * The bank block, or null when no account is on file.
 *
 * All-or-nothing on the account being present: a "pay the advance to" box with
 * only a branch name in it is worse than no box.
 */
export function buildBankDetails(
  factory: QuoteDocumentSources["factory"],
): BankDetails | null {
  const accountNumber = clean(factory?.bank_account_number);
  const upi = clean(factory?.upi_number);
  if (!accountNumber && !upi) return null;
  return {
    accountName: clean(factory?.bank_account_name),
    accountNumber,
    ifsc: clean(factory?.bank_ifsc),
    bankName: clean(factory?.bank_name),
    branch: clean(factory?.bank_branch),
    upiNumber: upi,
  };
}

/**
 * "8 Aug 2026", always in IST. The factory, the customer and the rep are all
 * in Tamil Nadu; a UTC-rendered date would be a day behind for anything
 * quoted after 5:30am local.
 */
export function formatQuoteDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

/** A quotation is only worth printing while it is still an offer. */
export function isExpired(validUntil: string | null | undefined, now: Date): boolean {
  if (!validUntil) return false;
  const end = new Date(validUntil);
  if (Number.isNaN(end.getTime())) return false;
  // valid_until is inclusive — a quote valid until the 8th is good all day.
  end.setUTCHours(23, 59, 59, 999);
  return now.getTime() > end.getTime();
}

/**
 * Filename a customer can find again in their downloads folder six weeks
 * later: `Maiyuri-Quote-MB-2026-0042-Murali.pdf`.
 */
export function quoteFilename(
  quoteNumber: string | null,
  customerName: string,
): string {
  const slugPart = (s: string) =>
    s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  const parts = ["Maiyuri-Quote", quoteNumber, customerName]
    .filter((p): p is string => Boolean(p && p.trim()))
    .map(slugPart)
    .filter(Boolean);
  return `${parts.join("-")}.pdf`;
}

const SYSTEM_LABELS: Record<string, string> = {
  interlock: "Maiyuri interlocking blocks",
  red_brick: "Conventional red brick",
  aac: "AAC block",
};

/**
 * The wall-cost comparison, but only when it is trustworthy.
 *
 * Returns null while the config is still the seeded PLACEHOLDER. Those numbers
 * exist so the feature has something to render in development; printing them on
 * a document a customer forwards to a contractor would be a fabricated claim
 * about construction economics.
 */
export function buildWallCostBlock(
  config: WallCostConfig | null | undefined,
  areaSqft: number | null,
): WallCostBlock | null {
  if (config?.is_seeded_placeholder) return null;
  const comparison = computeWallComparison(config, areaSqft);
  if (!comparison) return null;

  // Ours first: the reader compares everything else against it.
  const ordered = [...comparison.systems].sort((a, b) =>
    a.system === "interlock" ? -1 : b.system === "interlock" ? 1 : 0,
  );

  return {
    areaSqft: comparison.areaSqft,
    interlockIsCheapest: comparison.interlockIsCheapest,
    rows: ordered.map((r) => ({
      label: SYSTEM_LABELS[r.system] ?? r.system,
      perSqft: r.perSqft,
      buildTotal: r.buildTotal,
      deltaVsInterlock: r.deltaRupeesVsInterlock,
    })),
  };
}

/**
 * The objection and the next step, from the AI copy written off the call.
 *
 * English only: @react-pdf's core fonts carry no Tamil glyphs, so Tamil copy
 * would render as blank boxes. Better a document the customer's contractor can
 * read than one nobody can.
 */
export function buildArgument(copyMap: SmartQuoteCopyMap | null | undefined): {
  objection: ObjectionBlock | null;
  nextStep: NextStepBlock | null;
} {
  const en = copyMap?.en ?? {};
  const answer = clean(en["objection.answer"]);
  const objection: ObjectionBlock | null = answer
    ? {
        // The answer is the substance; a missing headline gets a plain one
        // rather than suppressing the whole block.
        headline:
          clean(en["objection.section_headline"]) ?? "About your main concern",
        answer,
        reassurance: clean(en["objection.reassurance"]),
      }
    : null;

  const stepHeadline =
    clean(en["cta.section_headline"]) ?? clean(en["cta.primary_cta"]);
  const nextStep: NextStepBlock | null = stepHeadline
    ? {
        headline: stepHeadline,
        description: clean(en["cta.route_explainer"]),
      }
    : null;

  return { objection, nextStep };
}

export function buildQuoteDocumentData(
  sources: QuoteDocumentSources,
): QuoteDocumentResult {
  const { quote, lead, factory, product, rep, wallCostConfig, copyMap } =
    sources;
  const pricing = quote.pricing_config ?? null;

  // Exactly the gate that blocks sharing the link. A PDF is a stronger claim
  // than a web page, so it cannot be looser.
  const readiness = getQuoteReadiness(pricing);
  if (!readiness.ready) {
    return { data: null, reason: readiness.reason };
  }
  if (!product) {
    return { data: null, reason: "The quoted product no longer exists." };
  }

  // Non-null by the readiness check above; asserted once, here.
  const rate = pricing?.quoted_rate as number;
  const quantity = pricing?.default_area_sqft as number;
  const unit = clean(product.unit) ?? "unit";
  const productName = clean(product.name) ?? "Interlocking bricks";

  const customerName = clean(lead?.name) ?? "Customer";
  const quotedOn = formatQuoteDate(quote.created_at);
  const { objection, nextStep } = buildArgument(copyMap);

  return {
    reason: null,
    data: {
      quoteNumber: clean(quote.quote_number),
      // created_at is a real timestamp on every row; the fallback is defensive.
      quotedOn: quotedOn ?? "",
      validUntil: formatQuoteDate(quote.valid_until),
      company: {
        name: clean(factory?.name) ?? "Maiyuri Bricks",
        legalName: clean(factory?.legal_name),
        gstin: clean(factory?.gstin),
        // The registered address is the one that belongs on a document; the
        // plain `address` is the factory pin used for distance maths, so it is
        // only a fallback.
        address: clean(factory?.registered_address) ?? clean(factory?.address),
        phone: clean(factory?.contact_phone),
        email: clean(factory?.contact_email),
        website: clean(factory?.website),
      },
      customer: {
        name: customerName,
        phone: clean(lead?.contact),
        location: clean(lead?.site_location) ?? clean(lead?.site_region),
      },
      lines: [
        {
          product: productName,
          unit,
          quantity,
          rate,
          amount: rate * quantity,
          hsnCode: clean(product.hsn_code),
        },
      ],
      total: rate * quantity,
      // The engineer's rate is quoted delivered — that is the whole point of
      // "the price is the price". `show_transport: false` means the business
      // deliberately quoted ex-factory on this one.
      deliveryIncluded: pricing?.show_transport !== false,
      distanceKm: pricing?.default_distance_km ?? null,
      priceNote: clean(pricing?.price_note),
      taxNote: clean(factory?.tax_note),
      terms: {
        payment: clean(factory?.payment_terms),
        delivery: clean(factory?.delivery_terms),
        additional: splitLines(factory?.additional_terms),
      },
      bank: buildBankDetails(factory),
      rep: {
        name: clean(rep?.name),
        phone: clean(rep?.phone) ?? clean(pricing?.rep_phone),
      },
      footerNote: clean(factory?.quote_footer_note),
      // The comparison is priced per sq.ft of WALL, so it can only use the
      // quoted quantity when that quantity is already an area. For a per-piece
      // product 4,000 means 4,000 bricks, not 4,000 sq.ft — treating it as
      // area would print a wall cost roughly nobody's, so the block is dropped
      // instead. Better silent than confidently wrong on a document a
      // contractor will check.
      wallCost: buildWallCostBlock(
        wallCostConfig,
        unit === "sqft" ? quantity : null,
      ),
      objection,
      nextStep,
    },
  };
}
