/**
 * Render the four-page quotation to PDF, server-side.
 *
 * The document is HTML because that is what the design is authored in — the
 * template carries its own DATA / CONTENT / DESIGN split and is the thing the
 * founder edits. Turning it into a PDF therefore means driving a real browser,
 * not re-implementing the layout in a PDF library.
 *
 * Locally that is whatever Chrome is installed. On Vercel it is
 * @sparticuz/chromium, a Lambda-sized build of headless Chromium.
 */

import fs from "node:fs";
import path from "node:path";

/** Everything the template's CONFIG block understands. */
export interface QuotationConfig {
  customerName: string;
  projectName: string;
  projectLocation: string;
  quotationNumber: string;
  quotationDate: string;
  validUntil: string;

  externalWallProduct: string;
  externalWallThickness: string;
  externalWallReason: string;
  internalWallProduct: string;
  internalWallThickness: string;
  internalWallReason: string;
  estimatedQuantity: string;
  deliveryTimeline: string;

  currency: string;
  pricingItems: {
    description: string;
    detail: string;
    qty: string;
    rate: string;
    amount: string;
  }[];
  subtotal: string;
  showGst: boolean;
  gstRate: string;
  gstAmount: string;
  taxNote: string;
  grandTotal: string;

  advancePercentage: number;
  paymentTerms: string;
  unloadingResponsibility: string;

  accountName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upi: string;

  salesPersonName: string;
  salesPersonPhone: string;
  whatsappNumber: string;
  website: string;
}

const ASSETS = [
  "corner", "temple", "skyline", "feather", "divider-leaf", "house",
  "lockup", "lockup-wide", "truck", "mascot-welcome", "mascot-brick",
  "advance-banner",
] as const;

const FACES: [string, number, string, string][] = [
  ["Playfair Display", 400, "normal", "PlayfairDisplay-Regular.ttf"],
  ["Playfair Display", 700, "normal", "PlayfairDisplay-Bold.ttf"],
  ["Playfair Display", 400, "italic", "PlayfairDisplay-Italic.ttf"],
];

/**
 * Resolve a directory that has to survive bundling. Nothing imports these
 * files, so Next's tracing cannot infer them — next.config.mjs force-includes
 * them, and the candidates below cover both the app root (Vercel) and the
 * monorepo root (tests, scripts).
 */
function resolveDir(rel: string, probe: string): string {
  const candidates = [
    path.join(process.cwd(), rel),
    path.join(process.cwd(), "apps/web", rel),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, probe))) return dir;
  }
  throw new Error(`Quotation ${rel} not found. Looked in:\n  ${candidates.join("\n  ")}`);
}

const dataUri = (file: string, mime: string) =>
  `data:${mime};base64,` + fs.readFileSync(file).toString("base64");

let cachedHtml: string | null = null;

/**
 * The template with artwork and fonts inlined — everything except the data.
 * Cached per process: re-reading two megabytes of PNG on every quotation would
 * be pointless I/O in a hot route.
 */
function templateWithAssets(): string {
  if (cachedHtml) return cachedHtml;

  const tplDir = resolveDir("src/lib/quotation-html", "template.html");
  const artDir = resolveDir("src/lib/pdf/art", "house.png");
  const fontDir = resolveDir("src/lib/pdf/fonts", "PlayfairDisplay-Regular.ttf");

  let html = fs.readFileSync(path.join(tplDir, "template.html"), "utf8");

  for (const name of ASSETS) {
    const token = `{{ASSET:${name}}}`;
    if (html.includes(token)) {
      html = html.split(token).join(dataUri(path.join(artDir, `${name}.png`), "image/png"));
    }
  }
  // The mark is the one asset the template takes from public/.
  if (html.includes("{{ASSET:mark}}")) {
    html = html
      .split("{{ASSET:mark}}")
      .join(dataUri(path.join(artDir, "lockup.png"), "image/png"));
  }

  const faces = FACES.map(([family, weight, style, file]) =>
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};` +
    `font-display:block;src:url(${dataUri(path.join(fontDir, file), "font/ttf")}) format('truetype');}`,
  ).join("\n");
  html = html.replace("<style>", `<style>\n${faces}`);

  cachedHtml = html;
  return html;
}

/** Swap the template's placeholder CONFIG for this quotation's data. */
function withConfig(html: string, config: QuotationConfig): string {
  const start = html.indexOf("const CONFIG = {");
  const end = html.indexOf("</script>", start);
  if (start < 0 || end < 0) throw new Error("Quotation template has no CONFIG block");

  // Only the customer-facing values are replaced. The evidence block —
  // verified lab results, the testimonial — stays exactly as the template
  // declares it, so a caller cannot inject an unverified claim.
  const tail = html.slice(start, end);
  const evidenceAt = tail.indexOf("    // — Evidence");
  const evidence = evidenceAt >= 0 ? tail.slice(evidenceAt) : "  };\n";

  const head =
    "const CONFIG = {\n" +
    Object.entries(config)
      .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
      .join("\n") +
    "\n\n" +
    evidence;

  return html.slice(0, start) + head + html.slice(end);
}

async function launch() {
  const puppeteer = await import("puppeteer-core");

  // Vercel sets VERCEL=1. Everywhere else, use a local Chrome.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const local =
    process.env.CHROME_PATH ??
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return puppeteer.launch({ executablePath: local, headless: true });
}

/** The quotation, as an A4 PDF. */
export async function renderQuotationPdf(
  config: QuotationConfig,
): Promise<Buffer> {
  const html = withConfig(templateWithAssets(), config);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    // Everything is inlined, so nothing is fetched; waiting on the network
    // would only cost time.
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
