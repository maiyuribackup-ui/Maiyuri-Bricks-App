"use client";

import { smartQuoteTokens, cn } from "../tokens";
import type { SmartQuoteLanguage } from "@maiyuri/shared";

interface LanguageToggleProps {
  value: SmartQuoteLanguage;
  onChange: (language: SmartQuoteLanguage) => void;
}

/**
 * Language toggle for EN/Tamil
 * Fixed position at top-right of screen
 */
export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  const { colors, typography, radius, transition, shadow } = smartQuoteTokens;

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50",
        "flex items-center gap-1 p-1",
        colors.background.secondary,
        radius.full,
        shadow.md,
        "border border-stone-200 dark:border-stone-700",
      )}
    >
      <button
        onClick={() => onChange("en")}
        className={cn(
          "px-3 py-1.5",
          typography.label.small,
          radius.full,
          transition.fast,
          value === "en"
            ? cn(colors.cta.bg, colors.cta.text)
            : cn(
                colors.text.secondary,
                "hover:bg-stone-200 dark:hover:bg-stone-700",
              ),
        )}
        aria-label="Switch to English"
        aria-pressed={value === "en"}
      >
        EN
      </button>
      <button
        onClick={() => onChange("ta")}
        className={cn(
          "px-3 py-1.5",
          typography.label.small,
          radius.full,
          transition.fast,
          value === "ta"
            ? cn(colors.cta.bg, colors.cta.text)
            : cn(
                colors.text.secondary,
                "hover:bg-stone-200 dark:hover:bg-stone-700",
              ),
        )}
        aria-label="Switch to Tamil"
        aria-pressed={value === "ta"}
      >
        தமிழ்
      </button>
    </div>
  );
}
