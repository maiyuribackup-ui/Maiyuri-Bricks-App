"use client";

import Image from "next/image";
import { smartQuoteTokens, cn } from "../tokens";
import type { SmartQuoteImage } from "@maiyuri/shared";

interface HeroSectionProps {
  image: SmartQuoteImage | null;
  headline: string;
  beliefBreaker?: string;
  trustAnchor?: string;
  ctaText?: string;
  onCtaClick?: () => void;
}

/**
 * Hero section with image, headline, and optional CTA
 */
export function HeroSection({
  image,
  headline,
  beliefBreaker,
  trustAnchor,
  ctaText,
  onCtaClick,
}: HeroSectionProps) {
  const { colors, typography, radius, transition, shadow, spacing } =
    smartQuoteTokens;

  return (
    <section className="relative min-h-[70vh] md:min-h-[80vh] flex flex-col justify-end">
      {/* Background Image */}
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
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 via-stone-900/40 to-transparent" />
        </div>
      ) : (
        // Fallback gradient background
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-stone-700 to-stone-900" />
      )}

      {/* Content */}
      <div
        className={cn(
          "relative z-10",
          spacing.section.mobile,
          spacing.section.tablet,
          spacing.container.maxWidth,
          "text-white",
        )}
      >
        {/* Headline */}
        <h1 className={cn(typography.headline.hero, "mb-4")}>{headline}</h1>

        {/* Belief breaker (optional) */}
        {beliefBreaker && (
          <p className={cn(typography.body.large, "mb-4 text-stone-200")}>
            {beliefBreaker}
          </p>
        )}

        {/* Trust anchor (optional) */}
        {trustAnchor && (
          <p className={cn(typography.body.small, "mb-6 text-stone-300")}>
            {trustAnchor}
          </p>
        )}

        {/* CTA Button (optional) */}
        {ctaText && onCtaClick && (
          <button
            onClick={onCtaClick}
            className={cn(
              "px-6 py-3",
              typography.body.base,
              "font-medium",
              colors.cta.bg,
              colors.cta.text,
              radius.lg,
              shadow.md,
              transition.base,
              "hover:scale-[1.02] active:scale-[0.98]",
            )}
          >
            {ctaText}
          </button>
        )}
      </div>
    </section>
  );
}
