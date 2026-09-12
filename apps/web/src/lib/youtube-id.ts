/**
 * Reading a YouTube video id out of whatever staff pasted.
 *
 * Lives here rather than in the route because a Next.js App Router route file
 * may only export the HTTP verbs and a fixed set of config fields — exporting
 * a helper from it fails `next build` even though `tsc --noEmit` is happy.
 */

/** Accepts a bare id, a watch?v= link, a youtu.be link or an embed link. */
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = value.match(re);
    if (m) return m[1];
  }
  return null;
}
