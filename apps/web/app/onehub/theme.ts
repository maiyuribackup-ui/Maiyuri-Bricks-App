/**
 * Maiyuri OneHub brand palette — a self-contained warm brick-red + cream
 * theme (distinct from the main app's earth-green shell) so the OneHub
 * surface matches the approved OneHub design. One locked accent (terracotta),
 * one radius scale. Keep every OneHub file on these tokens.
 */
export const onehub = {
  brand: '#7a2817', // deep brick red (headings, wordmark)
  brandDark: '#6d2212',
  brandTop: '#8a2f1c', // sidebar gradient top
  canvas: '#fbf5ea', // page background (warm cream)
  card: '#ffffff',
  cardBorder: '#efe3d2',
  accent: '#c0562f', // terracotta — the single CTA/interactive accent
  accentDark: '#a8481f',
  text: '#4a3428',
  textMuted: '#9c8676',
  // priority badge tints
  high: { fg: '#c1453e', bg: '#fbe4df' },
  medium: { fg: '#b3781a', bg: '#f8ecd4' },
  low: { fg: '#3f7d4d', bg: '#e4f1e3' },
} as const;
