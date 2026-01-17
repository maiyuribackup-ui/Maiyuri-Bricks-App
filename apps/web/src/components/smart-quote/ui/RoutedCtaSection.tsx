"use client";

import { useState } from "react";
import { smartQuoteTokens, cn } from "../tokens";
import type {
  SmartQuoteLanguage,
  SmartQuoteRoute,
  SmartQuoteCtaSubmission,
} from "@maiyuri/shared";

interface RoutedCtaSectionProps {
  routeDecision: SmartQuoteRoute;
  language: SmartQuoteLanguage;
  onSubmit: (data: SmartQuoteCtaSubmission) => Promise<void>;
}

// CTA content based on route decision
const routeContent: Record<
  SmartQuoteRoute,
  {
    headline: { en: string; ta: string };
    ctaLabel: { en: string; ta: string };
    description: { en: string; ta: string };
    icon: string;
  }
> = {
  site_visit: {
    headline: {
      en: "See it for yourself",
      ta: "நீங்களே பாருங்கள்",
    },
    ctaLabel: {
      en: "Book a Factory Visit",
      ta: "தொழிற்சாலை பார்வையை முன்பதிவு செய்யுங்கள்",
    },
    description: {
      en: "Visit our factory in Chennai. See the bricks, meet the team, ask any questions.",
      ta: "சென்னையில் எங்கள் தொழிற்சாலையைப் பார்வையிடுங்கள். செங்கற்களைப் பாருங்கள், குழுவைச் சந்தியுங்கள்.",
    },
    icon: "🏭",
  },
  technical_call: {
    headline: {
      en: "Let's talk details",
      ta: "விவரங்களைப் பேசுவோம்",
    },
    ctaLabel: {
      en: "Schedule a Technical Call",
      ta: "தொழில்நுட்ப அழைப்பை திட்டமிடுங்கள்",
    },
    description: {
      en: "15-minute call with our technical expert. Get answers to your specific questions.",
      ta: "எங்கள் தொழில்நுட்ப நிபுணருடன் 15 நிமிட அழைப்பு. உங்கள் குறிப்பிட்ட கேள்விகளுக்கு பதில்களைப் பெறுங்கள்.",
    },
    icon: "📞",
  },
  cost_estimate: {
    headline: {
      en: "Get your estimate",
      ta: "உங்கள் மதிப்பீட்டைப் பெறுங்கள்",
    },
    ctaLabel: {
      en: "Get a Detailed Quote",
      ta: "விரிவான மேற்கோளைப் பெறுங்கள்",
    },
    description: {
      en: "Share your project details. We'll prepare a customized quote within 24 hours.",
      ta: "உங்கள் திட்ட விவரங்களைப் பகிரவும். 24 மணி நேரத்தில் தனிப்பயனாக்கப்பட்ட மேற்கோளைத் தயாரிப்போம்.",
    },
    icon: "📋",
  },
  nurture: {
    headline: {
      en: "Stay connected",
      ta: "தொடர்பில் இருங்கள்",
    },
    ctaLabel: {
      en: "Send Me Updates",
      ta: "புதுப்பிப்புகளை அனுப்புங்கள்",
    },
    description: {
      en: "Get occasional updates about earth blocks, new projects, and special offers.",
      ta: "மண் செங்கற்கள், புதிய திட்டங்கள் மற்றும் சிறப்பு சலுகைகள் பற்றிய அவ்வப்போது புதுப்பிப்புகளைப் பெறுங்கள்.",
    },
    icon: "💌",
  },
};

/**
 * Routed CTA Section - AI-routed single CTA
 *
 * Design principles:
 * - ONE CTA only (AI-selected based on route_decision)
 * - Minimal form (name + phone only)
 * - Trust signals below
 * - No multiple options - decisive flow
 */
export function RoutedCtaSection({
  routeDecision,
  language,
  onSubmit,
}: RoutedCtaSectionProps) {
  const { colors, typography, radius, shadow, spacing, transition } =
    smartQuoteTokens;

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    locality: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const content = routeContent[routeDecision];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError(language === "ta" ? "பெயர் தேவை" : "Name is required");
      return;
    }
    if (!formData.phone.trim() || formData.phone.length < 10) {
      setError(
        language === "ta"
          ? "சரியான தொலைபேசி எண் தேவை"
          : "Valid phone number required",
      );
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        name: formData.name,
        phone: formData.phone,
        locality: formData.locality || undefined,
      });
      setSubmitted(true);
    } catch {
      setError(
        language === "ta"
          ? "சமர்ப்பிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்."
          : "Failed to submit. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (submitted) {
    return (
      <section
        id="cta-section"
        className={cn(
          colors.background.primary,
          spacing.section.mobile,
          spacing.section.tablet,
          spacing.section.desktop,
        )}
      >
        <div className={cn(spacing.container.narrow, "text-center")}>
          <div className="text-5xl mb-6">✓</div>
          <h2
            className={cn(
              typography.headline.section,
              colors.text.primary,
              "mb-4",
            )}
          >
            {language === "ta" ? "நன்றி!" : "Thank you!"}
          </h2>
          <p className={cn(typography.body.base, colors.text.secondary)}>
            {language === "ta"
              ? "நாங்கள் விரைவில் உங்களை தொடர்பு கொள்வோம்."
              : "We'll be in touch soon."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="cta-section"
      className={cn(
        colors.background.primary,
        spacing.section.mobile,
        spacing.section.tablet,
        spacing.section.desktop,
      )}
    >
      <div className={cn(spacing.container.narrow)}>
        {/* Icon */}
        <div className="text-center mb-4">
          <span className="text-4xl">{content.icon}</span>
        </div>

        {/* Headline */}
        <h2
          className={cn(
            typography.headline.section,
            colors.text.primary,
            "text-center mb-4",
          )}
        >
          {content.headline[language]}
        </h2>

        {/* Description */}
        <p
          className={cn(
            typography.body.base,
            colors.text.secondary,
            "text-center mb-8",
          )}
        >
          {content.description[language]}
        </p>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className={cn("bg-white", radius["2xl"], shadow.card, "p-6 md:p-8")}
        >
          {/* Name field */}
          <div className="mb-4">
            <label
              htmlFor="sq-name"
              className={cn(
                typography.label.base,
                colors.text.primary,
                "block mb-2",
              )}
            >
              {language === "ta" ? "உங்கள் பெயர்" : "Your name"}
            </label>
            <input
              id="sq-name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className={cn(
                "w-full px-4 py-3",
                typography.body.base,
                colors.text.primary,
                radius.lg,
                "border border-stone-200",
                "focus:outline-none focus:ring-2 focus:ring-[#C87941] focus:border-transparent",
                transition.fast,
              )}
              placeholder={language === "ta" ? "பெயர்" : "Name"}
            />
          </div>

          {/* Phone field */}
          <div className="mb-6">
            <label
              htmlFor="sq-phone"
              className={cn(
                typography.label.base,
                colors.text.primary,
                "block mb-2",
              )}
            >
              {language === "ta" ? "தொலைபேசி எண்" : "Phone number"}
            </label>
            <input
              id="sq-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              className={cn(
                "w-full px-4 py-3",
                typography.body.base,
                colors.text.primary,
                radius.lg,
                "border border-stone-200",
                "focus:outline-none focus:ring-2 focus:ring-[#C87941] focus:border-transparent",
                transition.fast,
              )}
              placeholder="98XXXXXXXX"
            />
          </div>

          {/* Error message */}
          {error && (
            <p
              className={cn(
                typography.body.small,
                "text-red-600",
                "text-center mb-4",
              )}
            >
              {error}
            </p>
          )}

          {/* Submit button - The ONE CTA */}
          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-4",
              typography.body.large,
              "font-semibold",
              colors.cta.bg,
              colors.cta.text,
              radius.xl,
              shadow.lg,
              transition.base,
              "hover:scale-[1.02] active:scale-[0.98]",
              loading && "opacity-70 cursor-not-allowed",
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {language === "ta" ? "சமர்ப்பிக்கிறது..." : "Submitting..."}
              </span>
            ) : (
              content.ctaLabel[language]
            )}
          </button>

          {/* Trust signals */}
          <div
            className={cn(
              "flex justify-center gap-4 mt-4",
              typography.label.small,
              colors.text.muted,
            )}
          >
            <span>{language === "ta" ? "ஸ்பாம் இல்லை" : "No spam"}</span>
            <span>&bull;</span>
            <span>{language === "ta" ? "அழுத்தம் இல்லை" : "No pressure"}</span>
          </div>
        </form>
      </div>
    </section>
  );
}
