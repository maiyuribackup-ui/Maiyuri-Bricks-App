/**
 * The quotation's typefaces.
 *
 * DESIGN.md chose Helvetica for the printed document so a forwarded PDF would
 * carry no embedded font and render identically everywhere. That decision is
 * superseded here on the founder's instruction: the quotation is a brand
 * document and has to match the approved artwork, which is set in a serif.
 *
 * What that costs, stated plainly:
 *   - The file grows. @react-pdf/renderer subsets on embed, so a quotation
 *     carries only the glyphs it uses, not the whole 190KB face.
 *   - The document is still English only. Neither face carries Tamil, so this
 *     changes nothing about the Tamil question — that still needs Noto Sans
 *     Tamil, embedded deliberately.
 *   - Rupees are still written "Rs." Playfair has no U+20B9 glyph either.
 *
 * Playfair Display carries the headings and body — the high-contrast
 * transitional serif of the wordmark. Cormorant Garamond SemiBold sets the
 * letterspaced labels, where Playfair's thin strokes disappear at 6-7pt.
 *
 * Both are SIL Open Font License 1.1, which permits embedding in a document.
 */

import path from "node:path";
import fs from "node:fs";
import { Font } from "@react-pdf/renderer";

/**
 * Where the .ttf files land at runtime.
 *
 * The renderer runs inside a route handler, so the fonts have to survive
 * bundling. next.config.mjs force-includes this directory via
 * outputFileTracingIncludes; the candidates below cover running from the app
 * directory (Vercel) and from the monorepo root (local scripts, tests).
 */
function fontDir(): string {
  const candidates = [
    path.join(process.cwd(), "src/lib/pdf/fonts"),
    path.join(process.cwd(), "apps/web/src/lib/pdf/fonts"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "PlayfairDisplay-Regular.ttf"))) return dir;
  }
  // Loud, not silent: a missing face would otherwise surface as a broken
  // document in a customer's hands rather than an error we can see.
  throw new Error(
    `Quotation fonts not found. Looked in:\n  ${candidates.join("\n  ")}`,
  );
}

let registered = false;

/** Idempotent — the module may be imported by several renders in one process. */
export function registerQuoteFonts(): void {
  if (registered) return;
  const dir = fontDir();

  Font.register({
    family: "Playfair",
    fonts: [
      { src: path.join(dir, "PlayfairDisplay-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "PlayfairDisplay-Bold.ttf"), fontWeight: 700 },
      {
        src: path.join(dir, "PlayfairDisplay-Italic.ttf"),
        fontWeight: 400,
        fontStyle: "italic",
      },
    ],
  });

  Font.register({
    family: "Cormorant",
    fonts: [
      { src: path.join(dir, "CormorantGaramond-SemiBold.ttf"), fontWeight: 600 },
    ],
  });

  // Hyphenation off: "Padianallur" broken across lines reads as a typo on a
  // commercial document.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}

export const F = {
  display: "Playfair",
  label: "Cormorant",
} as const;
