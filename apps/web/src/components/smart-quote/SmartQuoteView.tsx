"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { smartQuoteTokens, cn } from "./tokens";
import { LanguageToggle } from "./ui/LanguageToggle";
import { HeroSection } from "./ui/HeroSection";
import { PersonalizationCard } from "./ui/PersonalizationCard";
import { WhyChennaiWorksSection } from "./ui/WhyChennaiWorksSection";
import { ProofSection } from "./ui/ProofSection";
import { ObjectionAnswerSection } from "./ui/ObjectionAnswerSection";
import { InteractiveEstimate } from "./ui/InteractiveEstimate";
import { WallCostComparison } from "@/components/wall-cost/WallCostComparison";
import { computeWallComparison } from "@/lib/pricing/wall-cost";
import {
  makeCopyReader,
  showBlock,
  showPage,
} from "@/lib/smart-quote-page";
import type {
  SmartQuoteLanguage,
  SmartQuotePageKey,
  SmartQuoteWithImages,
  SmartQuotePersonalizationSnippets,
} from "@maiyuri/shared";

interface OfferedProduct {
  id: string;
  name: string;
  unit: string;
}

interface SmartQuoteViewProps {
  quote: SmartQuoteWithImages & { products?: OfferedProduct[] };
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

// Brand fallback hero copy. Used only when the AI did not write
// entry.hero_headline / entry.belief_breaker for this quote (older quotes, or
// a model response that omitted the key) — never as the default for everyone.
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

  // AI copy for the active language, with brand text as the fallback.
  const getCopy = useMemo(
    () => makeCopyReader(quote.copy_map, language),
    [quote.copy_map, language],
  );

  // The AI's page plan decides which sections this customer sees. Quotes
  // generated before page_config existed have none, and show everything.
  const config = quote.page_config;
  const show = useCallback(
    (page: SmartQuotePageKey, block?: string) =>
      block ? showBlock(config, page, block) : showPage(config, page),
    [config],
  );

  // Get personalization snippets (from lead's SmartQuotePayload or defaults)
  const personalizationSnippets: SmartQuotePersonalizationSnippets =
    quote.lead?.smart_quote_payload?.personalization_snippets ??
    defaultSnippets;

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

  // Quote URL (for prefilled WhatsApp message)
  const quoteUrl =
    typeof window !== "undefined" ? window.location.href : `/sq/${slug}`;

  const { colors, typography } = smartQuoteTokens;

  return (
    <div className={cn("min-h-screen", colors.background.primary)}>
      {/* Language Toggle - Fixed top right */}
      <LanguageToggle value={language} onChange={handleLanguageChange} />

      {/* === ENTRY: HERO === */}
      {/* Headline and sub-headline now come from the AI's copy_map, so a
          price-driven lead and a factory-visit lead no longer open with the
          same sentence. Brand copy remains the fallback. */}
      {show("entry") && (
        <section data-section="hero">
          <HeroSection
            image={quote.images.entry}
            headline={getCopy(
              "entry.hero_headline",
              heroCopy[language].headline,
            )}
            subheadline={getCopy(
              "entry.belief_breaker",
              heroCopy[language].subheadline,
            )}
            language={language}
          />
        </section>
      )}

      {/* === ENTRY: MADE FOR YOU === */}
      {show("entry", "belief_breaker") && (
        <section data-section="made_for_you">
          <PersonalizationCard
            snippets={personalizationSnippets}
            language={language}
            persona={quote.persona ?? undefined}
          />
        </section>
      )}

      {/* === CLIMATE: WHY CHENNAI WORKS === */}
      {show("climate", "chennai_logic") && (
        <section data-section="why_chennai_works">
          <WhyChennaiWorksSection
            language={language}
            headline={getCopy("climate.section_headline")}
            insight={getCopy("climate.core_insight")}
          />
        </section>
      )}

      {/* === ENTRY: PROOF TEASER === */}
      {/* The AI drops trust_anchor for leads who already trust us. */}
      {show("entry", "trust_anchor") && (
        <section data-section="proof_teaser">
          <ProofSection language={language} />
        </section>
      )}

      {/* === OBJECTION HANDLING === */}
      {topObjections.length > 0 && show("objection", "top_objection_answer") && (
        <section data-section="objection_handling">
          <ObjectionAnswerSection
            objections={topObjections}
            language={language}
            headline={getCopy("objection.section_headline")}
            answer={getCopy("objection.answer")}
            reassurance={getCopy("objection.reassurance")}
          />
        </section>
      )}

      {/* === COST: INTERACTIVE ESTIMATE + WHATSAPP CTA === */}
      {show("cost") && (
        <section data-section="instant_estimate">
          <InteractiveEstimate
            slug={slug}
            language={language}
            products={quote.products ?? []}
            pricing={quote.pricing_config}
            quoteUrl={quoteUrl}
            headline={getCopy("cost.section_headline")}
            rangeFrame={getCopy("cost.range_frame")}
            ctaLabel={getCopy("cta.primary_cta", getCopy("entry.primary_cta"))}
            onCtaTrack={(payload) => trackEvent("cta_click", "instant_estimate", payload)}
          />
        </section>
      )}

      {/* === COST: WALL-COST COMPARISON === */}
      {show("cost", "soft_compare") &&
        (() => {
          const comparison = computeWallComparison(
            quote.wall_cost_config,
            quote.pricing_config?.default_area_sqft ?? null,
          );
          if (!comparison) return null;
          return (
            <section data-section="cost_comparison" className="max-w-2xl mx-auto px-4">
              <WallCostComparison comparison={comparison} language={language} />
            </section>
          );
        })()}

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
