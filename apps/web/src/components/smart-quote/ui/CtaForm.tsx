"use client";

import { useState } from "react";
import { smartQuoteTokens, cn } from "../tokens";
import { CtaButton } from "./CtaButton";
import type {
  SmartQuoteLanguage,
  SmartQuoteCtaSubmission,
} from "@maiyuri/shared";

interface CtaFormProps {
  language: SmartQuoteLanguage;
  labels: {
    name: string;
    phone: string;
    locality: string;
  };
  ctaText: string;
  routeExplainer?: string;
  onSubmit: (data: SmartQuoteCtaSubmission) => Promise<void>;
}

/**
 * CTA submission form
 */
export function CtaForm({
  language,
  labels,
  ctaText,
  routeExplainer,
  onSubmit,
}: CtaFormProps) {
  const { colors, typography, radius, transition, spacing } = smartQuoteTokens;

  const [formData, setFormData] = useState<SmartQuoteCtaSubmission>({
    name: "",
    phone: "",
    locality: "",
    preferred_time: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
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
      await onSubmit(formData);
      setSubmitted(true);
    } catch (err) {
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
      <div className={cn("text-center", spacing.gap.lg)}>
        <div className="text-4xl mb-4">&#x2705;</div>
        <h3 className={cn(typography.headline.subsection, colors.text.primary)}>
          {language === "ta" ? "நன்றி!" : "Thank you!"}
        </h3>
        <p className={cn(typography.body.base, colors.text.secondary)}>
          {language === "ta"
            ? "நாங்கள் விரைவில் உங்களை தொடர்பு கொள்வோம்."
            : "We'll contact you soon."}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("space-y-4", "max-w-md mx-auto")}
    >
      {/* Route explainer */}
      {routeExplainer && (
        <p
          className={cn(
            typography.body.small,
            colors.text.muted,
            "text-center mb-6",
          )}
        >
          {routeExplainer}
        </p>
      )}

      {/* Name field */}
      <div>
        <label
          htmlFor="sq-name"
          className={cn(
            typography.label.base,
            colors.text.primary,
            "block mb-1.5",
          )}
        >
          {labels.name}
        </label>
        <input
          id="sq-name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={cn(
            "w-full px-4 py-3",
            typography.body.base,
            colors.background.secondary,
            colors.text.primary,
            radius.md,
            "border border-stone-200 dark:border-stone-700",
            "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent",
            transition.fast,
          )}
          placeholder={language === "ta" ? "உங்கள் பெயர்" : "Your name"}
        />
      </div>

      {/* Phone field */}
      <div>
        <label
          htmlFor="sq-phone"
          className={cn(
            typography.label.base,
            colors.text.primary,
            "block mb-1.5",
          )}
        >
          {labels.phone}
        </label>
        <input
          id="sq-phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className={cn(
            "w-full px-4 py-3",
            typography.body.base,
            colors.background.secondary,
            colors.text.primary,
            radius.md,
            "border border-stone-200 dark:border-stone-700",
            "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent",
            transition.fast,
          )}
          placeholder={language === "ta" ? "98xxxxxxxx" : "98xxxxxxxx"}
        />
      </div>

      {/* Locality field (optional) */}
      <div>
        <label
          htmlFor="sq-locality"
          className={cn(
            typography.label.base,
            colors.text.primary,
            "block mb-1.5",
          )}
        >
          {labels.locality}{" "}
          <span className={cn(typography.label.small, colors.text.muted)}>
            ({language === "ta" ? "விருப்பமானது" : "optional"})
          </span>
        </label>
        <input
          id="sq-locality"
          type="text"
          value={formData.locality}
          onChange={(e) =>
            setFormData({ ...formData, locality: e.target.value })
          }
          className={cn(
            "w-full px-4 py-3",
            typography.body.base,
            colors.background.secondary,
            colors.text.primary,
            radius.md,
            "border border-stone-200 dark:border-stone-700",
            "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent",
            transition.fast,
          )}
          placeholder={
            language === "ta" ? "அண்ணா நகர், சென்னை" : "Anna Nagar, Chennai"
          }
        />
      </div>

      {/* Error message */}
      {error && (
        <p
          className={cn(
            typography.body.small,
            "text-red-600 dark:text-red-400",
            "text-center",
          )}
        >
          {error}
        </p>
      )}

      {/* Submit button */}
      <div className="pt-2">
        <CtaButton
          type="submit"
          size="lg"
          loading={loading}
          disabled={loading}
          className="w-full"
        >
          {ctaText}
        </CtaButton>
      </div>

      {/* Trust signals */}
      <div
        className={cn(
          "flex justify-center gap-4 pt-2",
          typography.label.small,
          colors.text.muted,
        )}
      >
        <span>{language === "ta" ? "2-3 நிமிடங்கள்" : "2-3 minutes"}</span>
        <span>&bull;</span>
        <span>{language === "ta" ? "ஸ்பாம் இல்லை" : "No spam"}</span>
        <span>&bull;</span>
        <span>{language === "ta" ? "அழுத்தம் இல்லை" : "No pressure"}</span>
      </div>
    </form>
  );
}
