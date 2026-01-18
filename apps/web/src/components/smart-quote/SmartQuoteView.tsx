"use client";

import { useState, useEffect, useCallback } from "react";
import { smartQuoteTokens, cn } from "./tokens";
import { LanguageToggle } from "./ui/LanguageToggle";
import { HeroSection } from "./ui/HeroSection";
import { PersonalizationCard } from "./ui/PersonalizationCard";
import { WhyChennaiWorksSection } from "./ui/WhyChennaiWorksSection";
import { ProofSection } from "./ui/ProofSection";
import { PriceSection } from "./ui/PriceSection";
import { ObjectionAnswerSection } from "./ui/ObjectionAnswerSection";
import { RoutedCtaSection } from "./ui/RoutedCtaSection";
import type {
  SmartQuoteLanguage,
  SmartQuoteWithImages,
  SmartQuoteCtaSubmission,
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
    p1: "We've analyzed your needs and believe earth blocks could be the perfect fit for your Chennai home.",
    p2: "Let us show you why this works for families like yours.",
  },
  ta: {
    p1: "உங்கள் தேவைகளை பகுப்பாய்வு செய்துள்ளோம், மண் செங்கற்கள் உங்கள் சென்னை வீட்டிற்கு சரியான தேர்வாக இருக்கும் என நம்புகிறோம்.",
    p2: "உங்களைப் போன்ற குடும்பங்களுக்கு இது ஏன் வேலை செய்கிறது என்பதைக் காட்டுவோம்.",
  },
};

// Hero copy - belief-breaking headline about Tamil architecture
const heroCopy = {
  en: {
    headline:
      "You've admired homes inspired by traditional Tamil architecture. Now you can build one in Chennai.",
    subheadline:
      "Not a heritage village. Not a resort. A real eco-friendly home designed for Chennai heat and city living.",
  },
  ta: {
    headline:
      "பாரம்பரிய தமிழ் கட்டிடக்கலையால் ஈர்க்கப்பட்ட வீடுகளை நீங்கள் பாராட்டியுள்ளீர்கள். இப்போது சென்னையில் ஒன்றை நீங்களே கட்டலாம்.",
    subheadline:
      "பாரம்பரிய கிராமம் அல்ல. ரிசார்ட் அல்ல. சென்னை வெப்பத்திற்கும் நகர வாழ்க்கைக்கும் வடிவமைக்கப்பட்ட உண்மையான சுற்றுச்சூழல் நட்பு வீடு.",
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

  // Get route decision (from payload or default based on stage)
  const routeDecision: SmartQuoteRoute =
    quote.route_decision ??
    (quote.stage === "hot" ? "cost_estimate" : "site_visit");

  // Get top objections (max 2)
  const topObjections =
    quote.top_objections.length > 0
      ? quote.top_objections.slice(0, 2)
      : [{ type: "price" as const, severity: "medium" as const }];

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

  // Track section views using Intersection Observer (40% visibility threshold)
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
      { threshold: 0.4 }, // 40% visibility as specified
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
      {/* Full-bleed image, belief-breaking headline, trust chips, CTA */}
      <section data-section="hero">
        <HeroSection
          image={quote.images.entry}
          headline={heroCopy[language].headline}
          subheadline={heroCopy[language].subheadline}
          language={language}
        />
      </section>

      {/* === SECTION 2: MADE FOR YOU === */}
      {/* Personalized insights from AI */}
      <section data-section="made_for_you">
        <PersonalizationCard
          snippets={personalizationSnippets}
          language={language}
          persona={quote.persona ?? undefined}
        />
      </section>

      {/* === SECTION 3: WHY CHENNAI WORKS === */}
      {/* Chennai-specific logic with 3 icon cards */}
      <section data-section="why_chennai_works">
        <WhyChennaiWorksSection language={language} />
      </section>

      {/* === SECTION 4: PROOF TEASER === */}
      {/* 2-3 real project images */}
      <section data-section="proof_teaser">
        <ProofSection language={language} />
      </section>

      {/* === SECTION 5: SMART RANGE === */}
      {/* Cost as range with "what affects it" chips */}
      <section data-section="smart_range">
        <PriceSection
          priceRange={getCopy("cost.range_placeholder", "₹45–₹55")}
          language={language}
        />
      </section>

      {/* === SECTION 6: OBJECTION HANDLING === */}
      {/* Max 2 objections, accordion style */}
      {topObjections.length > 0 && (
        <section data-section="objection_handling">
          <ObjectionAnswerSection
            objections={topObjections}
            language={language}
          />
        </section>
      )}

      {/* === SECTION 7: FINAL CTA === */}
      {/* Single button that changes by route_decision */}
      <section data-section="final_cta">
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
