"use client";

import { useState, useEffect, useCallback } from "react";
import { smartQuoteTokens, cn, getSectionClasses } from "./tokens";
import { LanguageToggle } from "./ui/LanguageToggle";
import { HeroSection } from "./ui/HeroSection";
import {
  ContentSection,
  ContentBlock,
  HighlightBox,
  PriceRange,
} from "./ui/ContentSection";
import { CtaButton, MicroCta } from "./ui/CtaButton";
import { CtaForm } from "./ui/CtaForm";
import type {
  SmartQuoteLanguage,
  SmartQuoteWithImages,
  SmartQuoteCtaSubmission,
} from "@maiyuri/shared";

interface SmartQuoteViewProps {
  quote: SmartQuoteWithImages;
  slug: string;
}

/**
 * Main Smart Quote customer view component
 * Renders personalized quote pages based on AI-generated content
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

  // Handle CTA click
  const handleCtaClick = (section: string) => {
    trackEvent("cta_click", section);
    // Scroll to CTA form
    const ctaSection = document.getElementById("cta-section");
    ctaSection?.scrollIntoView({ behavior: "smooth" });
  };

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
      {/* Language Toggle */}
      <LanguageToggle value={language} onChange={handleLanguageChange} />

      {/* Entry Page - Hero */}
      <section data-section="entry">
        <HeroSection
          image={quote.images.entry}
          headline={getCopy(
            "entry.hero_headline",
            "Build cooler. Build healthier.",
          )}
          beliefBreaker={getCopy("entry.belief_breaker")}
          trustAnchor={getCopy("entry.trust_anchor")}
          ctaText={getCopy("entry.primary_cta")}
          onCtaClick={() => handleCtaClick("entry")}
        />
      </section>

      {/* Climate Page */}
      <section data-section="climate">
        <ContentSection
          headline={getCopy(
            "climate.section_headline",
            "Made for Chennai summers",
          )}
          image={quote.images.climate}
          imagePosition="top"
        >
          <ContentBlock>
            {getCopy(
              "climate.core_insight",
              "Earth blocks naturally regulate indoor temperature.",
            )}
          </ContentBlock>
          <div className="mt-6">
            <MicroCta onClick={() => handleCtaClick("climate")}>
              {getCopy("climate.micro_cta", "See how it works")}
            </MicroCta>
          </div>
        </ContentSection>
      </section>

      {/* Cost Page */}
      <section data-section="cost">
        <ContentSection
          headline={getCopy(
            "cost.section_headline",
            "What does it really cost?",
          )}
          image={quote.images.cost}
          imagePosition="top"
        >
          <ContentBlock>
            {getCopy(
              "cost.range_frame",
              "Your home size and design drive the final price.",
            )}
          </ContentBlock>

          <HighlightBox variant="accent" className="my-6">
            <PriceRange
              label={language === "ta" ? "விலை வரம்பு" : "Price Range"}
              value={getCopy("cost.range_placeholder", "₹45–₹55 per sq.ft")}
            />
          </HighlightBox>

          <ContentBlock>
            {getCopy(
              "cost.drivers",
              "Final cost depends on design complexity.",
            )}
          </ContentBlock>

          <div className="mt-6">
            <MicroCta onClick={() => handleCtaClick("cost")}>
              {getCopy("cost.micro_cta", "Get your estimate")}
            </MicroCta>
          </div>
        </ContentSection>
      </section>

      {/* Objection Page */}
      {quote.top_objections.length > 0 && (
        <section data-section="objection">
          <ContentSection
            headline={getCopy(
              "objection.section_headline",
              "You might be wondering...",
            )}
            image={quote.images.objection}
            imagePosition="background"
          >
            <HighlightBox className="mb-4">
              <p className={cn(typography.body.base, colors.text.primary)}>
                {getCopy(
                  "objection.answer",
                  "Earth blocks are proven and reliable.",
                )}
              </p>
            </HighlightBox>

            <ContentBlock>
              {getCopy(
                "objection.reassurance",
                "We'll show you real examples.",
              )}
            </ContentBlock>
          </ContentSection>
        </section>
      )}

      {/* CTA Page */}
      <section data-section="cta" id="cta-section">
        <ContentSection
          headline={getCopy("cta.section_headline", "Ready to explore?")}
          image={quote.images.cta}
          imagePosition="top"
          variant="narrow"
        >
          <CtaForm
            language={language}
            labels={{
              name: getCopy("cta.form_name_label", "Your name"),
              phone: getCopy("cta.form_phone_label", "Phone number"),
              locality: getCopy("cta.form_locality_label", "Your locality"),
            }}
            ctaText={getCopy("cta.primary_cta", "Get Started")}
            routeExplainer={getCopy("cta.route_explainer")}
            onSubmit={handleSubmit}
          />
        </ContentSection>
      </section>

      {/* Footer */}
      <footer className={cn("py-8 text-center", colors.background.secondary)}>
        <p className={cn(typography.label.small, colors.text.muted)}>
          {language === "ta" ? "மையூரி செங்கற்கள்" : "Maiyuri Bricks"}
        </p>
        <p className={cn(typography.label.small, colors.text.muted, "mt-1")}>
          {language === "ta"
            ? "சென்னையில் சுற்றுச்சூழல் நட்பு கட்டுமானம்"
            : "Eco-friendly construction in Chennai"}
        </p>
      </footer>
    </div>
  );
}
