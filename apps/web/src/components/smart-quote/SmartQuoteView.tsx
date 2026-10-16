"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { smartQuoteTokens, cn } from "./tokens";
import { LanguageToggle } from "./ui/LanguageToggle";
import { WhyChennaiWorksSection } from "./ui/WhyChennaiWorksSection";
import { ObjectionAnswerSection } from "./ui/ObjectionAnswerSection";
import { InteractiveEstimate } from "./ui/InteractiveEstimate";
import { DownloadQuoteButton } from "./ui/DownloadQuoteButton";
import { RoutedCtaSection } from "./ui/RoutedCtaSection";
import { WallCostComparison } from "@/components/wall-cost/WallCostComparison";
import { computeWallComparison } from "@/lib/pricing/wall-cost";
import {
  makeCopyReader,
  showBlock,
  showPage,
} from "@/lib/smart-quote-page";
import type {
  SmartQuoteCtaSubmission,
  SmartQuoteLanguage,
  SmartQuotePageKey,
  SmartQuoteWithImages,
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

/**
 * Smart Quote View — quote-first.
 *
 * The customer opens this link to see a price, so the price leads and nothing
 * competes with it. Supporting sections follow only when they earn their place
 * (the AI's page_config decides), and each speaks to THIS conversation.
 *
 * Section order:
 * 1. The quote      — product, engineer's rate, quantity, total
 * 2. Top objection  — the concern actually raised on the call
 * 3. Cost comparison— why this price beats red brick / AAC
 * 4. Chennai logic  — why it works here, kept brief
 * 5. CTA            — the single AI-routed next step
 *
 * Removed deliberately: full-bleed hero image, the Tamil-architecture story,
 * the "made for you" card and stock proof photos — none of them are the quote.
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

  // The AI-routed CTA closes the page when the plan includes it. When it does,
  // it is the ONE call to action, so the estimate's inline WhatsApp button
  // stands down (see the "one CTA only" rule in the strategy prompt).
  const showRoutedCta = show("cta", "single_cta");

  const handleCtaSubmit = useCallback(
    async (data: SmartQuoteCtaSubmission) => {
      const res = await fetch(`/api/sq/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        // Surface failure to RoutedCtaSection so the customer sees its error
        // state and can retry, rather than a silent success.
        throw new Error("Submit failed");
      }
      trackEvent("cta_click", "routed_cta", {
        route: quote.route_decision,
      });
    },
    [slug, trackEvent, quote.route_decision],
  );

  // Same gate the staff share buttons use: no engineer rate, no document.
  const rate = quote.pricing_config?.quoted_rate;
  const hasEngineerRate = rate != null && rate > 0;

  // Unit of the quoted product ("piece" or "sqft"), which decides whether the
  // quoted quantity can be read as a wall area.
  const quotedUnit = quote.products?.find(
    (p) => p.id === quote.pricing_config?.default_product,
  )?.unit;

  // Quote URL (for prefilled WhatsApp message)
  const quoteUrl =
    typeof window !== "undefined" ? window.location.href : `/sq/${slug}`;

  const { colors, typography } = smartQuoteTokens;

  return (
    <div className={cn("min-h-screen", colors.background.primary)}>
      {/* Language Toggle - Fixed top right */}
      <LanguageToggle value={language} onChange={handleLanguageChange} />

      {/* === THE QUOTE === */}
      {/* This IS the page. The customer opens the link to see a price, so the
          quote leads — product, engineer's rate, quantity and total. Everything
          below is supporting material and only appears when it earns its place. */}
      <section data-section="instant_estimate" className="pt-14 sm:pt-16">
        <InteractiveEstimate
          slug={slug}
          language={language}
          products={quote.products ?? []}
          pricing={quote.pricing_config}
          quoteUrl={quoteUrl}
          headline={getCopy(
            "cost.section_headline",
            language === "ta" ? "உங்கள் விலைப்புள்ளி" : "Your quote",
          )}
          rangeFrame={getCopy("cost.range_frame")}
          ctaLabel={getCopy("cta.primary_cta", getCopy("entry.primary_cta"))}
          showWhatsAppCta={!showRoutedCta}
          onCtaTrack={(payload) => trackEvent("cta_click", "instant_estimate", payload)}
        />
      </section>

      {/* The quote as a document the customer can forward. Only offered when an
          engineer has set a rate — without one the PDF route refuses, and a
          button that always fails is worse than no button. */}
      {hasEngineerRate && (
        <DownloadQuoteButton
          slug={slug}
          language={language}
          onDownload={() =>
            trackEvent("cta_click", "pdf_download", {
              source: "customer_page",
            })
          }
        />
      )}

      {/* === SUPPORTING: THE TOP OBJECTION === */}
      {/* Only the concern actually raised on the call, directly under the price. */}
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

      {/* === SUPPORTING: WALL-COST COMPARISON === */}
      {show("cost", "soft_compare") &&
        (() => {
          // The comparison is priced per sq.ft of WALL. `default_area_sqft` is
          // the quoted quantity in the PRODUCT's unit, so for a per-piece
          // product it is a brick count — 4,000 bricks is not 4,000 sq.ft of
          // wall, and treating it as one printed a wall cost that was simply
          // wrong. Only feed it through when the quantity really is an area.
          const comparison = computeWallComparison(
            quote.wall_cost_config,
            quotedUnit === "sqft"
              ? (quote.pricing_config?.default_area_sqft ?? null)
              : null,
          );
          if (!comparison) return null;
          return (
            <section data-section="cost_comparison" className="max-w-2xl mx-auto px-4">
              <WallCostComparison comparison={comparison} language={language} />
            </section>
          );
        })()}

      {/* === SUPPORTING: WHY THIS WORKS IN CHENNAI === */}
      {show("climate", "chennai_logic") && (
        <section data-section="why_chennai_works">
          <WhyChennaiWorksSection
            language={language}
            headline={getCopy("climate.section_headline")}
            insight={getCopy("climate.core_insight")}
          />
        </section>
      )}

      {/* === CTA: THE ROUTED NEXT STEP === */}
      {/* One CTA, chosen by the AI from the conversation: book a factory
          visit, schedule a technical call, get an estimate, or nurture. */}
      {showRoutedCta && (
        <section data-section="routed_cta">
          <RoutedCtaSection
            /* No route decided → nurture, the lowest-pressure next step */
            routeDecision={quote.route_decision ?? "nurture"}
            language={language}
            onSubmit={handleCtaSubmit}
            headline={getCopy("cta.section_headline")}
            ctaLabel={getCopy("cta.primary_cta")}
            description={getCopy("cta.route_explainer")}
          />
        </section>
      )}

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
