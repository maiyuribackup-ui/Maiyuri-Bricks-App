"use client";

import { smartQuoteTokens, cn } from "../tokens";
import type { SmartQuotePersonalizationSnippets } from "@maiyuri/shared";

interface PersonalizationCardProps {
  snippets: SmartQuotePersonalizationSnippets;
  language: "en" | "ta";
  persona?: string;
}

/**
 * Personalization Card - "Made for you" section
 *
 * Design principles:
 * - Floating card with soft shadow
 * - Personalized snippet from AI
 * - Warm, conversational tone
 * - Shows the customer "we know you"
 */
export function PersonalizationCard({
  snippets,
  language,
  persona,
}: PersonalizationCardProps) {
  const { colors, typography, radius, shadow, spacing } = smartQuoteTokens;

  const snippet = snippets[language];
  const title =
    language === "ta" ? "உங்களுக்காக உருவாக்கப்பட்டது" : "Made for you";

  // Persona badge text
  const personaBadge = persona
    ? {
        homeowner:
          language === "ta" ? "வீட்டு உரிமையாளர்" : "Building Your Home",
        builder: language === "ta" ? "கட்டுமான தொழிலாளி" : "Construction Pro",
        architect: language === "ta" ? "கட்டிடக்கலை நிபுணர்" : "Design Expert",
        unknown: null,
      }[persona]
    : null;

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
        {/* The personalization card */}
        <div
          className={cn(
            colors.background.card,
            radius["2xl"],
            shadow.card,
            "p-6 md:p-8 lg:p-10",
            "border border-[#C87941]/10",
          )}
        >
          {/* Header with decorative line */}
          <div className="flex items-center gap-3 mb-6">
            <div className={cn("h-px flex-1", colors.decorative.line)} />
            <span className={cn(typography.label.small, colors.accent.primary)}>
              {title}
            </span>
            <div className={cn("h-px flex-1", colors.decorative.line)} />
          </div>

          {/* Persona badge (if applicable) */}
          {personaBadge && (
            <div className="mb-4">
              <span
                className={cn(
                  "inline-block px-3 py-1",
                  radius.full,
                  "bg-[#C87941]/10",
                  typography.label.small,
                  colors.accent.primary,
                )}
              >
                {personaBadge}
              </span>
            </div>
          )}

          {/* Primary personalization snippet */}
          <p
            className={cn(
              typography.personalized,
              colors.text.primary,
              "mb-4",
              "font-normal",
            )}
          >
            {snippet.p1}
          </p>

          {/* Secondary snippet (if provided) */}
          {snippet.p2 && (
            <p className={cn(typography.body.base, colors.text.secondary)}>
              {snippet.p2}
            </p>
          )}

          {/* Decorative accent dot */}
          <div className="mt-6 flex justify-center">
            <div
              className={cn("w-2 h-2", radius.full, colors.decorative.dot)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
