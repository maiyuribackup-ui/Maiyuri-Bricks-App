"use client";

import { smartQuoteTokens, cn } from "../tokens";

interface WhyChennaiWorksSectionProps {
  language: "en" | "ta";
  /** AI copy (climate.section_headline). Blank string keeps the brand default. */
  headline?: string;
  /** AI copy (climate.core_insight) shown under the headline when present. */
  insight?: string;
}

/**
 * Why Chennai Works Section
 *
 * Design principles:
 * - 3 icon cards showing Chennai-specific logic
 * - Clean, minimal design with icons
 * - Addresses the "can this really work in Chennai?" objection
 */
export function WhyChennaiWorksSection({
  language,
  headline,
  insight,
}: WhyChennaiWorksSectionProps) {
  const { typography, colors, radius, spacing } = smartQuoteTokens;

  const title =
    headline?.trim() ||
    (language === "ta"
      ? "சென்னையில் இது ஏன் வேலை செய்கிறது"
      : "Why this works in Chennai");

  const cards =
    language === "ta"
      ? [
          {
            icon: "🌡️",
            title: "வெப்பத்திற்கு உருவாக்கப்பட்டது",
            description:
              "மண் செங்கற்கள் இயற்கையாகவே வெப்பத்தை கட்டுப்படுத்துகின்றன. AC இல்லாமல் குளிர்ச்சியாக இருங்கள்.",
          },
          {
            icon: "🏗️",
            title: "உள்ளூர் திறமை வேலை செய்கிறது",
            description:
              "எங்கள் கட்டுமான முறை சென்னையில் உள்ள கொத்தனார்களால் எளிதில் செய்ய முடியும்.",
          },
          {
            icon: "✓",
            title: "நிரூபிக்கப்பட்ட சென்னையில்",
            description:
              "சென்னை முழுவதும் 50+ வீடுகள் ஏற்கனவே கட்டப்பட்டுள்ளன.",
          },
        ]
      : [
          {
            icon: "🌡️",
            title: "Built for heat",
            description:
              "Earth blocks naturally regulate temperature. Stay cool without running AC all day.",
          },
          {
            icon: "🏗️",
            title: "Local masons can do it",
            description:
              "Our construction method works with the skilled masons already in Chennai.",
          },
          {
            icon: "✓",
            title: "Proven in Chennai",
            description:
              "50+ homes already built across Chennai with this exact system.",
          },
        ];

  return (
    <section
      className={cn(
        colors.background.primary,
        spacing.section.mobile,
        spacing.section.tablet,
        spacing.section.desktop,
      )}
    >
      <div className={cn(spacing.container.maxWidth)}>
        {/* Section Title */}
        <h2
          className={cn(
            typography.headline.section,
            colors.text.primary,
            "text-center",
            insight?.trim() ? "mb-4" : "mb-12 md:mb-16",
          )}
        >
          {title}
        </h2>

        {/* AI's climate insight for this specific lead, when written */}
        {insight?.trim() && (
          <p
            className={cn(
              typography.body.base,
              colors.text.secondary,
              "text-center max-w-2xl mx-auto mb-12 md:mb-16",
            )}
          >
            {insight}
          </p>
        )}

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {cards.map((card, index) => (
            <div
              key={index}
              className={cn(
                "p-8",
                colors.background.secondary,
                radius["2xl"],
                "border border-[#E8DED2]",
                "transition-all duration-200",
                "hover:shadow-lg hover:border-[#C46A2B]/20",
              )}
            >
              {/* Icon */}
              <div className="text-5xl mb-4">{card.icon}</div>

              {/* Title */}
              <h3
                className={cn(
                  typography.headline.card,
                  colors.text.primary,
                  "mb-3",
                )}
              >
                {card.title}
              </h3>

              {/* Description */}
              <p className={cn(typography.body.small, colors.text.secondary)}>
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
