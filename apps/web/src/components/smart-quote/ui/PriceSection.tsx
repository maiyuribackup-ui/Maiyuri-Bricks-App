"use client";

import { smartQuoteTokens, cn } from "../tokens";

interface PriceSectionProps {
  priceRange: string;
  language: "en" | "ta";
}

const content = {
  headline: {
    en: "What does it cost?",
    ta: "இதன் விலை என்ன?",
  },
  rangeLabel: {
    en: "Your range",
    ta: "உங்கள் வரம்பு",
  },
  whatAffects: {
    en: "What affects the price:",
    ta: "விலையை பாதிக்கும் விஷயங்கள்:",
  },
};

/**
 * Price Section - Cost Range with Factors
 *
 * Design principles:
 * - Cost as range, not exact number
 * - "What affects it" chips showing transparency
 * - Clean, minimal design
 */
export function PriceSection({ priceRange, language }: PriceSectionProps) {
  const { colors, typography, radius, spacing } = smartQuoteTokens;

  // Factors that affect price
  const priceFactors =
    language === "ta"
      ? [
          "வடிவமைப்பு சிக்கல்தன்மை",
          "பகுதி",
          "வீட்டின் அளவு",
          "பூச்சு விருப்பம்",
        ]
      : ["Design complexity", "Location", "Home size", "Finish options"];

  return (
    <section
      className={cn(
        colors.background.primary,
        spacing.section.mobile,
        spacing.section.tablet,
        spacing.section.desktop,
      )}
    >
      <div className={cn(spacing.container.narrow)}>
        {/* Section headline */}
        <h2
          className={cn(
            typography.headline.section,
            colors.text.primary,
            "text-center mb-10 md:mb-12",
          )}
        >
          {content.headline[language]}
        </h2>

        {/* Price range display */}
        <div
          className={cn(
            "bg-white",
            radius["2xl"],
            "p-8 md:p-10",
            "text-center",
            "border border-[#E8DED2]",
          )}
        >
          {/* Label */}
          <p
            className={cn(typography.label.base, colors.text.secondary, "mb-3")}
          >
            {content.rangeLabel[language]}
          </p>

          {/* Price range - big and bold */}
          <p
            className={cn(
              "text-5xl md:text-6xl font-bold",
              colors.text.primary,
              "mb-8",
            )}
          >
            {priceRange}
          </p>

          {/* What affects it label */}
          <p
            className={cn(
              typography.label.small,
              colors.text.muted,
              "mb-4",
              "uppercase",
            )}
          >
            {content.whatAffects[language]}
          </p>

          {/* Factor chips */}
          <div className="flex flex-wrap justify-center gap-3">
            {priceFactors.map((factor, index) => (
              <div
                key={index}
                className={cn(
                  "inline-flex items-center px-4 py-2",
                  "bg-[#FBF7F2]",
                  radius.chip,
                  typography.body.small,
                  colors.text.secondary,
                  "border border-[#E8DED2]",
                )}
              >
                {factor}
              </div>
            ))}
          </div>
        </div>

        {/* Note below */}
        <p
          className={cn(
            typography.body.small,
            colors.text.muted,
            "text-center mt-6",
          )}
        >
          {language === "ta"
            ? "விலை வரம்பு கட்டுமான பொருட்களுக்கு மட்டுமே"
            : "Price range is for construction materials only"}
        </p>
      </div>
    </section>
  );
}
