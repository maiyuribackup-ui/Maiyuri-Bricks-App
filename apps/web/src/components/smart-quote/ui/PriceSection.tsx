"use client";

import Image from "next/image";
import { smartQuoteTokens, cn } from "../tokens";
import type { SmartQuoteImage } from "@maiyuri/shared";

interface PriceSectionProps {
  image: SmartQuoteImage | null;
  priceRange: string;
  language: "en" | "ta";
}

const content = {
  headline: {
    en: "What does it cost?",
    ta: "இதன் விலை என்ன?",
  },
  rangeLabel: {
    en: "Price Range",
    ta: "விலை வரம்பு",
  },
  explanation: {
    en: "Final price depends on your design, location, and specifications. Get a personalized estimate.",
    ta: "இறுதி விலை உங்கள் வடிவமைப்பு, இருப்பிடம் மற்றும் விவரக்குறிப்புகளைப் பொறுத்தது. தனிப்பயனாக்கப்பட்ட மதிப்பீட்டைப் பெறுங்கள்.",
  },
  savingsNote: {
    en: "Most customers save 25-35% compared to conventional bricks",
    ta: "பெரும்பாலான வாடிக்கையாளர்கள் வழக்கமான செங்கற்களை விட 25-35% சேமிக்கிறார்கள்",
  },
};

/**
 * Price Section - Cost display
 *
 * Design principles:
 * - Clear price range display
 * - Comparison to conventional
 * - "Get estimate" natural flow to CTA
 */
export function PriceSection({
  image,
  priceRange,
  language,
}: PriceSectionProps) {
  const { colors, typography, radius, shadow, spacing } = smartQuoteTokens;

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
        {/* Section headline */}
        <h2
          className={cn(
            typography.headline.section,
            colors.text.primary,
            "text-center mb-8 md:mb-12",
          )}
        >
          {content.headline[language]}
        </h2>

        {/* Price card */}
        <div
          className={cn(
            "bg-white",
            radius["2xl"],
            shadow.card,
            "p-6 md:p-8 lg:p-10",
            "text-center",
            "border border-[#C87941]/10",
          )}
        >
          {/* Price range label */}
          <p className={cn(typography.label.small, colors.text.muted, "mb-2")}>
            {content.rangeLabel[language]}
          </p>

          {/* Price value - big and bold */}
          <p
            className={cn(
              "text-4xl md:text-5xl lg:text-6xl font-bold",
              colors.accent.primary,
              "mb-4",
            )}
          >
            {priceRange}
          </p>

          {/* Per unit label */}
          <p
            className={cn(typography.body.base, colors.text.secondary, "mb-6")}
          >
            {language === "ta" ? "ஒரு சதுர அடிக்கு" : "per square foot"}
          </p>

          {/* Divider */}
          <div
            className={cn("h-px w-24 mx-auto mb-6", colors.decorative.line)}
          />

          {/* Explanation */}
          <p
            className={cn(
              typography.body.small,
              colors.text.muted,
              "max-w-md mx-auto mb-6",
            )}
          >
            {content.explanation[language]}
          </p>

          {/* Savings highlight */}
          <div
            className={cn(
              "inline-flex items-center gap-2",
              "px-4 py-2",
              radius.lg,
              "bg-emerald-50",
            )}
          >
            <svg
              className="w-5 h-5 text-emerald-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className={cn(typography.body.small, "text-emerald-700")}>
              {content.savingsNote[language]}
            </span>
          </div>
        </div>

        {/* Optional image below price */}
        {image && (
          <div className={cn("mt-8", radius.xl, "overflow-hidden")}>
            <div className="relative aspect-[21/9]">
              <Image
                src={image.image_url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 80vw"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
