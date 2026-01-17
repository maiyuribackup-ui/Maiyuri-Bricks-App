"use client";

import Image from "next/image";
import { smartQuoteTokens, cn } from "../tokens";
import type { SmartQuoteImage } from "@maiyuri/shared";

interface HeroSectionProps {
  image: SmartQuoteImage | null;
  headline: string;
  subheadline?: string;
}

/**
 * Hero section - Steve Jobs style
 *
 * Design principles:
 * - Full-bleed image (100vw × 85vh)
 * - One belief-breaking headline
 * - NO CTA button (let them breathe)
 * - Text at bottom with gradient overlay
 */
export function HeroSection({
  image,
  headline,
  subheadline,
}: HeroSectionProps) {
  const { typography, spacing } = smartQuoteTokens;

  return (
    <section className="relative min-h-[85vh] flex flex-col justify-end">
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
          {/* Gradient overlay - stronger at bottom for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        </div>
      ) : (
        // Fallback - earthy gradient
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#4A3728] to-[#2D1F16]" />
      )}

      {/* Content - positioned at bottom */}
      <div
        className={cn(
          "relative z-10",
          spacing.section.mobile,
          spacing.section.tablet,
          spacing.container.maxWidth,
          "text-white",
          "pb-16 md:pb-20 lg:pb-24", // Extra bottom padding
        )}
      >
        {/* Belief-breaking Headline */}
        <h1
          className={cn(
            typography.headline.hero,
            "mb-4",
            "text-white",
            "drop-shadow-lg",
          )}
        >
          {headline}
        </h1>

        {/* Optional subheadline */}
        {subheadline && (
          <p
            className={cn(
              typography.body.large,
              "text-white/90",
              "max-w-lg", // Constrain width for readability
            )}
          >
            {subheadline}
          </p>
        )}

        {/* Scroll indicator */}
        <div className="mt-8 flex justify-center">
          <div className="animate-bounce">
            <svg
              className="w-6 h-6 text-white/60"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
