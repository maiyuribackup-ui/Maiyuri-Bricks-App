"use client";

import { smartQuoteTokens, cn } from "../tokens";

interface ProofSectionProps {
  language: "en" | "ta";
}

// Social proof data
const proofItems = [
  {
    icon: "🏠",
    value: "150+",
    label: { en: "Homes built", ta: "வீடுகள் கட்டப்பட்டன" },
  },
  {
    icon: "📍",
    value: "Chennai",
    label: { en: "Local factory", ta: "உள்ளூர் தொழிற்சாலை" },
  },
  {
    icon: "⭐",
    value: "4.8",
    label: { en: "Google rating", ta: "கூகுள் மதிப்பீடு" },
  },
];

const testimonialSnippet = {
  en: "We've helped families across Chennai build cooler, healthier homes.",
  ta: "சென்னை முழுவதும் குடும்பங்கள் குளிர்ச்சியான, ஆரோக்கியமான வீடுகளை கட்ட நாங்கள் உதவியுள்ளோம்.",
};

/**
 * Proof Section - Social proof badges
 *
 * Design principles:
 * - Quick-scan proof badges (3 max)
 * - Numbers that build trust
 * - No lengthy testimonials here
 */
export function ProofSection({ language }: ProofSectionProps) {
  const { colors, typography, radius, shadow, spacing } = smartQuoteTokens;

  return (
    <section
      className={cn(
        colors.background.secondary,
        spacing.section.mobile,
        spacing.section.tablet,
        spacing.section.desktop,
      )}
    >
      <div className={cn(spacing.container.maxWidth)}>
        {/* Trust statement */}
        <p
          className={cn(
            typography.body.base,
            colors.text.secondary,
            "text-center mb-8 md:mb-10",
          )}
        >
          {testimonialSnippet[language]}
        </p>

        {/* Proof badges */}
        <div className="flex justify-center gap-4 md:gap-8">
          {proofItems.map((item, index) => (
            <div
              key={index}
              className={cn(
                "bg-white",
                radius.xl,
                shadow.card,
                "px-4 py-4 md:px-6 md:py-5",
                "text-center",
                "min-w-[100px] md:min-w-[120px]",
              )}
            >
              <span className="text-2xl md:text-3xl block mb-2">
                {item.icon}
              </span>
              <p
                className={cn(
                  "text-xl md:text-2xl font-bold",
                  colors.text.primary,
                )}
              >
                {item.value}
              </p>
              <p
                className={cn(
                  typography.label.small,
                  colors.text.muted,
                  "mt-1",
                )}
              >
                {item.label[language]}
              </p>
            </div>
          ))}
        </div>

        {/* Trust badge */}
        <div className="mt-8 flex justify-center">
          <div
            className={cn(
              "inline-flex items-center gap-2",
              "px-4 py-2",
              radius.full,
              colors.trust.bg,
            )}
          >
            <svg
              className={cn("w-4 h-4", colors.trust.icon)}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className={cn(typography.label.base, colors.trust.text)}>
              {language === "ta"
                ? "சரிபார்க்கப்பட்ட வணிகம்"
                : "Verified Business"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
