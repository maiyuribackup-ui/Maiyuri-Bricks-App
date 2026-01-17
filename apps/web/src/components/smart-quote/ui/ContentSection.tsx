"use client";

import Image from "next/image";
import { smartQuoteTokens, cn, getSectionClasses } from "../tokens";
import type { SmartQuoteImage } from "@maiyuri/shared";

interface ContentSectionProps {
  headline: string;
  children: React.ReactNode;
  image?: SmartQuoteImage | null;
  imagePosition?: "top" | "background";
  variant?: "default" | "narrow" | "wide";
  className?: string;
}

/**
 * Generic content section with optional image
 */
export function ContentSection({
  headline,
  children,
  image,
  imagePosition = "top",
  variant = "default",
  className,
}: ContentSectionProps) {
  const { colors, typography, spacing, radius, shadow } = smartQuoteTokens;

  // Background image variant
  if (image && imagePosition === "background") {
    return (
      <section className={cn("relative min-h-[50vh]", className)}>
        <div className="absolute inset-0 z-0">
          <Image
            src={image.image_url}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-stone-900/60" />
        </div>
        <div
          className={cn(
            "relative z-10",
            getSectionClasses(variant),
            "text-white",
          )}
        >
          <h2 className={cn(typography.headline.section, "mb-6")}>
            {headline}
          </h2>
          {children}
        </div>
      </section>
    );
  }

  // Top image or no image variant
  return (
    <section className={cn(getSectionClasses(variant), className)}>
      {/* Top image */}
      {image && imagePosition === "top" && (
        <div
          className={cn(
            "mb-8 -mx-4 md:-mx-6 lg:-mx-8",
            radius.xl,
            "overflow-hidden",
          )}
        >
          <div className="relative aspect-[16/9] md:aspect-[21/9]">
            <Image
              src={image.image_url}
              alt=""
              fill
              className="object-cover"
              sizes="100vw"
            />
          </div>
        </div>
      )}

      <h2
        className={cn(typography.headline.section, colors.text.primary, "mb-6")}
      >
        {headline}
      </h2>

      <div className={cn(colors.text.secondary)}>{children}</div>
    </section>
  );
}

/**
 * Content block for body text
 */
export function ContentBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { typography, colors } = smartQuoteTokens;

  return (
    <div
      className={cn(
        typography.body.base,
        colors.text.secondary,
        "mb-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Highlight box for important information
 */
export function HighlightBox({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "accent";
  className?: string;
}) {
  const { colors, radius, spacing, typography } = smartQuoteTokens;

  return (
    <div
      className={cn(
        "p-4 md:p-6",
        radius.lg,
        variant === "accent"
          ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
          : colors.background.secondary,
        className,
      )}
    >
      <div className={cn(typography.body.base, colors.text.primary)}>
        {children}
      </div>
    </div>
  );
}

/**
 * Price range display
 */
export function PriceRange({
  label,
  value,
  className,
}: {
  label?: string;
  value: string;
  className?: string;
}) {
  const { colors, typography } = smartQuoteTokens;

  return (
    <div className={cn("text-center my-6", className)}>
      {label && (
        <p className={cn(typography.label.small, colors.text.muted, "mb-2")}>
          {label}
        </p>
      )}
      <p
        className={cn(
          typography.headline.section,
          colors.accent.primary,
          "font-bold",
        )}
      >
        {value}
      </p>
    </div>
  );
}
