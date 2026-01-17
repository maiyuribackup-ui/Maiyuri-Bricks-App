"use client";

import { useState, useEffect, useCallback } from "react";
import { smartQuoteTokens, cn } from "./tokens";
import { LanguageToggle } from "./ui/LanguageToggle";
import { HeroSection } from "./ui/HeroSection";
import { PersonalizationCard } from "./ui/PersonalizationCard";
import { ChennaiLogicSection } from "./ui/ChennaiLogicSection";
import { ProofSection } from "./ui/ProofSection";
import { PriceSection } from "./ui/PriceSection";
import { ObjectionAnswerSection } from "./ui/ObjectionAnswerSection";
import { RoutedCtaSection } from "./ui/RoutedCtaSection";
import type {
  SmartQuoteLanguage,
  SmartQuoteWithImages,
  SmartQuoteCtaSubmission,
  SmartQuoteAngle,
  SmartQuoteRoute,
  SmartQuotePersonalizationSnippets,
} from "@maiyuri/shared";

interface SmartQuoteViewProps {
  quote: SmartQuoteWithImages;
  slug: string;
}

// Default personalization snippets if not provided
const defaultSnippets: SmartQuotePersonalizationSnippets = {
  en: {
    p1: "We understand you're looking for the best option for your home.",
    p2: "Let us show you why earth blocks might be the perfect choice.",
  },
  ta: {
    p1: "உங்கள் வீட்டிற்கு சிறந்த விருப்பத்தை நீங்கள் தேடுகிறீர்கள் என்பதை நாங்கள் புரிந்துகொள்கிறோம்.",
    p2: "மண் செங்கற்கள் ஏன் சரியான தேர்வாக இருக்கும் என்பதைக் காட்டுவோம்.",
  },
};

/**
 * Smart Quote View - Steve Jobs Style
 *
 * Design Philosophy:
 * - One idea per screen
 * - Big visuals, few words
 * - Breathing room everywhere
 * - AI-routed personalization
 *
 * Section Order:
 * 1. Hero - Belief-breaking headline
 * 2. Personalization - "Made for you" card
 * 3. Chennai Logic - Primary angle benefit
 * 4. Proof - Social proof badges
 * 5. Cost - Price range display
 * 6. Objections - Answer top concern
 * 7. CTA - AI-routed single action
 */
export function SmartQuoteView({ quote, slug }: SmartQuoteViewProps) {
  const [language, setLanguage] = useState<SmartQuoteLanguage>(
    quote.language_default,
  );

  // Get copy for current language
  const copy = quote.copy_map[language];
  const getCopy = useCallback(
    (key: string, fallback: string = ""): string => {
      return copy[key] ?? fallback;
    },
    [copy],
  );

  // Get personalization snippets (from lead's SmartQuotePayload or defaults)
  const personalizationSnippets: SmartQuotePersonalizationSnippets =
    quote.lead?.smart_quote_payload?.personalization_snippets ??
    defaultSnippets;

  // Get primary angle (from payload or default to cooling for Chennai)
  const primaryAngle: SmartQuoteAngle =
    (quote.primary_angle as SmartQuoteAngle) ?? "cooling";

  // Get route decision (from payload or default based on stage)
  const routeDecision: SmartQuoteRoute =
    quote.route_decision ??
    (quote.stage === "hot" ? "cost_estimate" : "site_visit");

  // Get top objection (first one, or default to price)
  const topObjection = quote.top_objections[0] ?? {
    type: "price",
    severity: "medium",
  };

  // Track events
  const trackEvent = useCallback(
    async (
      eventType: string,
      sectionKey?: string,
      payload?: Record<string, unknown>,
    ) => {
      try {
        await fetch(`/api/sq/${slug}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: eventType,
            section_key: sectionKey,
            payload,
          }),
        });
      } catch (error) {
        // Silent fail for analytics
        console.error("Failed to track event:", error);
      }
    },
    [slug],
  );

  // Track page view on mount
  useEffect(() => {
    trackEvent("view");
  }, [trackEvent]);

  // Track language toggle
  const handleLanguageChange = (newLang: SmartQuoteLanguage) => {
    setLanguage(newLang);
    trackEvent("lang_toggle", undefined, { from: language, to: newLang });
  };

  // Track section views using Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionKey = entry.target.getAttribute("data-section");
            if (sectionKey) {
              trackEvent("section_view", sectionKey);
            }
          }
        });
      },
      { threshold: 0.5 },
    );

    const sections = document.querySelectorAll("[data-section]");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [trackEvent]);

  // Handle form submission
  const handleSubmit = async (data: SmartQuoteCtaSubmission) => {
    const response = await fetch(`/api/sq/${slug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Submission failed");
    }

    trackEvent("form_submit", "cta", { ...data });
  };

  const { colors, typography } = smartQuoteTokens;

  return (
    <div className={cn("min-h-screen", colors.background.primary)}>
      {/* Language Toggle - Fixed top right */}
      <LanguageToggle value={language} onChange={handleLanguageChange} />

      {/* === SECTION 1: HERO === */}
      {/* Belief-breaking headline, full-bleed image, NO CTA */}
      <section data-section="hero">
        <HeroSection
          image={quote.images.entry}
          headline={getCopy(
            "entry.hero_headline",
            language === "ta"
              ? "குளிர்ச்சியாக கட்டுங்கள். ஆரோக்கியமாக வாழுங்கள்."
              : "Build cooler. Live healthier.",
          )}
          subheadline={getCopy("entry.belief_breaker")}
        />
      </section>

      {/* === SECTION 2: PERSONALIZATION === */}
      {/* "Made for you" card with AI-generated snippets */}
      <section data-section="personalization">
        <PersonalizationCard
          snippets={personalizationSnippets}
          language={language}
          persona={quote.persona ?? undefined}
        />
      </section>

      {/* === SECTION 3: CHENNAI LOGIC === */}
      {/* Primary angle benefit with stat */}
      <section data-section="logic">
        <ChennaiLogicSection
          image={quote.images.climate}
          primaryAngle={primaryAngle}
          language={language}
        />
      </section>

      {/* === SECTION 4: PROOF === */}
      {/* Social proof badges */}
      <section data-section="proof">
        <ProofSection language={language} />
      </section>

      {/* === SECTION 5: COST === */}
      {/* Price range display */}
      <section data-section="cost">
        <PriceSection
          image={quote.images.cost}
          priceRange={getCopy("cost.range_placeholder", "₹45–₹55")}
          language={language}
        />
      </section>

      {/* === SECTION 6: OBJECTIONS === */}
      {/* Answer top objection */}
      {quote.top_objections.length > 0 && (
        <section data-section="objection">
          <ObjectionAnswerSection
            objection={topObjection}
            language={language}
          />
        </section>
      )}

      {/* === SECTION 7: CTA === */}
      {/* AI-routed single CTA */}
      <section data-section="cta">
        <RoutedCtaSection
          routeDecision={routeDecision}
          language={language}
          onSubmit={handleSubmit}
        />
      </section>

      {/* Footer */}
      <footer className={cn("py-10 text-center", colors.background.secondary)}>
        <p className={cn(typography.label.base, colors.text.primary)}>
          {language === "ta" ? "மையூரி செங்கற்கள்" : "Maiyuri Bricks"}
        </p>
        <p className={cn(typography.body.small, colors.text.muted, "mt-2")}>
          {language === "ta"
            ? "சென்னையில் சுற்றுச்சூழல் நட்பு கட்டுமானம்"
            : "Eco-friendly construction in Chennai"}
        </p>
        <p className={cn(typography.label.small, colors.text.muted, "mt-4")}>
          © 2025 Maiyuri Bricks
        </p>
      </footer>
    </div>
  );
}
