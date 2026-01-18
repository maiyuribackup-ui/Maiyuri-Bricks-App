"use client";

import Image from "next/image";
import { smartQuoteTokens, cn } from "../tokens";
import type { SmartQuoteImage } from "@maiyuri/shared";

interface HeroSectionProps {
  image: SmartQuoteImage | null;
  headline: string;
  subheadline?: string;
  language: "en" | "ta";
}

/**
 * Hero Section - Steve Jobs Style Redesign
 *
 * Design principles:
 * - Full-bleed high-quality image
 * - Belief-breaking headline about Tamil architecture
 * - Trust chips (2-3 minutes, No spam, No pressure)
 * - Single clear CTA
 * - Gradient overlay for text readability
 */
export function HeroSection({
  image,
  headline,
  subheadline,
  language,
}: HeroSectionProps) {
  const { typography, spacing, colors, radius } = smartQuoteTokens;

  // Trust chips content
  const trustChips =
    language === "ta"
      ? ["2–3 நிமிடங்கள்", "ஸ்பேம் இல்லை", "அழுத்தம் இல்லை"]
      : ["2–3 minutes", "No spam", "No pressure"];

  const ctaText =
    language === "ta"
      ? "உங்கள் நிலத்திற்கு இது எப்படி வேலை செய்கிறது என்பதைப் பார்க்கவும்"
      : "See how this works for your plot";

  return (
    <section className="relative min-h-screen flex flex-col justify-end">
      {/* Full-bleed Background Image */}
      {image ? (
        <div className="absolute inset-0 z-0">
          <Image
            src={image.image_url}
            alt=""
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          {/* Gradient overlay - top: rgba(0,0,0,0.70), bottom: rgba(0,0,0,0.35) */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.35) 100%)",
            }}
          />
        </div>
      ) : (
        // Fallback - dark gradient
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-stone-900 to-stone-800" />
      )}

      {/* Content - positioned at bottom */}
      <div
        className={cn(
          "relative z-10",
          "px-6 md:px-10 lg:px-12",
          "pb-12 md:pb-16 lg:pb-20",
          spacing.container.maxWidth,
        )}
      >
        {/* Trust chips - above headline */}
        <div className="flex flex-wrap gap-3 mb-6">
          {trustChips.map((chip, index) => (
            <div
              key={index}
              className={cn(
                "inline-flex items-center px-4 py-2",
                "bg-white/10 backdrop-blur-md",
                radius.chip,
                "text-white/90",
                typography.label.small,
                "border border-white/20",
              )}
            >
              {chip}
            </div>
          ))}
        </div>

        {/* Belief-breaking Headline */}
        <h1
          className={cn(
            typography.headline.hero,
            "mb-4 max-w-3xl",
            "text-white",
            "drop-shadow-2xl",
          )}
        >
          {headline}
        </h1>

        {/* Subheadline */}
        {subheadline && (
          <p
            className={cn(
              typography.body.large,
              "text-white/90",
              "max-w-2xl mb-8",
              "drop-shadow-lg",
            )}
          >
            {subheadline}
          </p>
        )}

        {/* CTA Button */}
        <button
          className={cn(
            "inline-flex items-center px-8 py-4",
            colors.cta.bg,
            colors.cta.text,
            radius.button,
            typography.body.base,
            "font-semibold",
            "shadow-xl",
            "transition-all duration-200",
            "hover:shadow-2xl hover:scale-[1.02]",
          )}
          onClick={() => {
            // Scroll to personalization section
            const section = document.querySelector(
              '[data-section="made_for_you"]',
            );
            section?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          {ctaText}
        </button>
      </div>
    </section>
  );
}
