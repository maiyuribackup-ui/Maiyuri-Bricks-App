/**
 * The quotation's ornament set — the founder's artwork, not drawn by us.
 *
 * Each file is the supplied PNG with its transparent margin trimmed, resized to
 * roughly twice its printed size and colour-quantized. That keeps the gilt
 * emboss and the engraving detail while holding all eight to ~410KB, so a
 * quotation still sends over WhatsApp.
 *
 * Read from disk rather than inlined as base64: at this size, data URIs would
 * add half a megabyte of unreadable string to the source. next.config.mjs
 * force-includes this directory into the PDF route's bundle.
 *
 * Regenerate from the original artwork rather than editing these files.
 */

import path from "node:path";
import fs from "node:fs";

export type ArtName =
  | "page-frame" // full-page gilt border, peacock-and-brick corners
  | "corner" // a single corner ornament, for pages the full frame would crowd
  | "house" // the brick house render — cover hero
  | "temple" // gopuram engraving
  | "skyline" // Chennai skyline strip
  | "feather" // peacock feather, used as a watermark
  | "divider-leaf" // green-and-gold leaf rule
  | "divider-knot"; // gold knot rule

function artDir(): string {
  const candidates = [
    path.join(process.cwd(), "src/lib/pdf/art"),
    path.join(process.cwd(), "apps/web/src/lib/pdf/art"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "page-frame.png"))) return dir;
  }
  throw new Error(
    `Quotation artwork not found. Looked in:\n  ${candidates.join("\n  ")}`,
  );
}

let dir: string | null = null;
const cache = new Map<ArtName, { data: Buffer; format: "png" }>();

/**
 * An ornament, ready for <Image src={...} />.
 *
 * Returns the decoded buffer rather than a path on purpose: @react-pdf/renderer
 * does not resolve bare filesystem paths, and — the part that cost an hour —
 * it fails *silently*, rendering nothing and leaving the document looking
 * merely unstyled. The buffer form is the supported one.
 *
 * Cached per process: eight ornaments re-read on every quotation would be
 * pointless file I/O in a hot route.
 */
export function art(name: ArtName): { data: Buffer; format: "png" } {
  const hit = cache.get(name);
  if (hit) return hit;
  dir ??= artDir();
  const entry = {
    data: fs.readFileSync(path.join(dir, `${name}.png`)),
    format: "png" as const,
  };
  cache.set(name, entry);
  return entry;
}
