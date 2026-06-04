/**
 * Bilingual copy for the wall-cost comparison (EN + Tamil). Scoped to this
 * feature — not a general i18n framework. The public quote renders the
 * customer's language; the staff view uses English.
 */
import type { SmartQuoteLanguage, WallSystem } from "@maiyuri/shared";

type Lang = SmartQuoteLanguage; // "en" | "ta"

interface WallCostStrings {
  sectionTitle: string;
  subtitle: string;
  oneLiner: string;
  perSqft: string;
  totalBuild: string;
  youSave: string; // "You save" prefix shown on the interlock row
  systemNames: Record<WallSystem, string>;
  lineItems: {
    masonry_units: string;
    mortar_cement: string;
    plastering: string;
    labour: string;
  };
  cheaperBadge: (pct: number) => string; // "NN% more expensive to build"
  noPlaster: string;
  /** Maiyuri's verified brand claims (qualitative — not the computed delta). */
  valueChips: string[];
}

const EN: WallCostStrings = {
  sectionTitle: "Why Maiyuri interlock costs less to build",
  subtitle: "Total wall cost per sq.ft — bricks + mortar + plastering + labour",
  oneLiner:
    "Higher brick price, lower total cost — no plastering and far less mortar.",
  perSqft: "per sq.ft",
  totalBuild: "Total build",
  youSave: "You save",
  systemNames: {
    interlock: "Maiyuri Interlock",
    red_brick: "Red Brick",
    aac: "AAC Block",
  },
  lineItems: {
    masonry_units: "Bricks / blocks",
    mortar_cement: "Mortar & cement",
    plastering: "Plastering",
    labour: "Labour",
  },
  cheaperBadge: (pct) => `+${pct}% to build`,
  noPlaster: "No plastering",
  valueChips: [
    "🌿 Eco-friendly",
    "🧱 70% less mortar",
    "🎨 No plastering",
    "⚡ Faster build",
    "👷 Free mason training",
  ],
};

const TA: WallCostStrings = {
  sectionTitle: "மயூரி இன்டர்லாக் ஏன் கட்ட மலிவானது",
  subtitle:
    "ஒரு சதுர அடிக்கான மொத்த சுவர் செலவு — செங்கல் + சாந்து + பூச்சு + கூலி",
  oneLiner:
    "செங்கல் விலை சற்று அதிகம், ஆனால் மொத்த கட்டுமான செலவு குறைவு — பூச்சு வேலை இல்லை, சாந்தும் மிகக் குறைவு.",
  perSqft: "சதுர அடிக்கு",
  totalBuild: "மொத்த செலவு",
  youSave: "நீங்கள் சேமிப்பது",
  systemNames: {
    interlock: "மயூரி இன்டர்லாக்",
    red_brick: "சிவப்பு செங்கல்",
    aac: "AAC கட்டி",
  },
  lineItems: {
    masonry_units: "செங்கல் / கட்டி",
    mortar_cement: "சாந்து & சிமெண்ட்",
    plastering: "பூச்சு வேலை",
    labour: "கூலி",
  },
  cheaperBadge: (pct) => `+${pct}% அதிகம்`,
  noPlaster: "பூச்சு இல்லை",
  valueChips: [
    "🌿 சுற்றுச்சூழல் நட்பு",
    "🧱 70% குறைந்த சாந்து",
    "🎨 பூச்சு இல்லை",
    "⚡ வேகமான கட்டுமானம்",
    "👷 இலவச பயிற்சி",
  ],
};

export function wallCostStrings(lang: Lang | null | undefined): WallCostStrings {
  return lang === "ta" ? TA : EN;
}
