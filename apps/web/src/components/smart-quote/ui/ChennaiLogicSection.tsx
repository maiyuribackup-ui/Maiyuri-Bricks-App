"use client";

import Image from "next/image";
import { smartQuoteTokens, cn } from "../tokens";
import type { SmartQuoteImage, SmartQuoteAngle } from "@maiyuri/shared";

interface ChennaiLogicSectionProps {
  image: SmartQuoteImage | null;
  primaryAngle: SmartQuoteAngle;
  language: "en" | "ta";
}

// Content based on primary angle - Chennai-specific logic
const angleContent: Record<
  SmartQuoteAngle,
  {
    headline: { en: string; ta: string };
    body: { en: string; ta: string };
    stat: { value: string; label: { en: string; ta: string } };
  }
> = {
  cooling: {
    headline: {
      en: "Built for Chennai summers",
      ta: "சென்னை கோடைக்காக உருவாக்கப்பட்டது",
    },
    body: {
      en: "Earth blocks naturally regulate indoor temperature. Stay 4-6°C cooler without running your AC all day.",
      ta: "மண் செங்கற்கள் இயற்கையாகவே உள்ளக வெப்பநிலையை கட்டுப்படுத்துகின்றன. ஏசி இல்லாமல் 4-6°C குளிர்ச்சியாக இருங்கள்.",
    },
    stat: {
      value: "4-6°C",
      label: { en: "Cooler indoors", ta: "குளிர்ச்சியான உட்புறம்" },
    },
  },
  health: {
    headline: {
      en: "Healthier air for your family",
      ta: "உங்கள் குடும்பத்திற்கு சுத்தமான காற்று",
    },
    body: {
      en: "No cement dust. No chemical emissions. Earth blocks breathe naturally, keeping your home's air fresh and clean.",
      ta: "சிமெண்ட் தூசி இல்லை. ரசாயன வெளியேற்றம் இல்லை. மண் செங்கற்கள் இயற்கையாக சுவாசிக்கின்றன.",
    },
    stat: {
      value: "0%",
      label: { en: "Chemical emissions", ta: "ரசாயன வெளியேற்றம்" },
    },
  },
  cost: {
    headline: {
      en: "Save more than you think",
      ta: "நீங்கள் நினைப்பதை விட அதிகம் சேமியுங்கள்",
    },
    body: {
      en: "30% less material cost. Faster construction. Lower maintenance. The savings add up quickly.",
      ta: "30% குறைவான பொருள் செலவு. வேகமான கட்டுமானம். குறைந்த பராமரிப்பு.",
    },
    stat: {
      value: "30%",
      label: { en: "Cost savings", ta: "செலவு சேமிப்பு" },
    },
  },
  sustainability: {
    headline: {
      en: "Building a greener future",
      ta: "பசுமையான எதிர்காலத்தை கட்டுதல்",
    },
    body: {
      en: "Lower carbon footprint. Made from local earth. No kiln firing needed. Your home helps the planet.",
      ta: "குறைந்த கார்பன் தடம். உள்ளூர் மண்ணிலிருந்து தயாரிக்கப்பட்டது. உலை எரிப்பு தேவையில்லை.",
    },
    stat: {
      value: "80%",
      label: { en: "Less carbon", ta: "குறைந்த கார்பன்" },
    },
  },
  design: {
    headline: {
      en: "Beautiful by nature",
      ta: "இயற்கையால் அழகானது",
    },
    body: {
      en: "Natural earth tones. Modern aesthetic. Design flexibility that architects love. Your home stands out.",
      ta: "இயற்கை மண் நிறங்கள். நவீன அழகியல். கட்டிடக் கலைஞர்கள் விரும்பும் வடிவமைப்பு நெகிழ்வுத்தன்மை.",
    },
    stat: {
      value: "100%",
      label: { en: "Natural finish", ta: "இயற்கை பூச்சு" },
    },
  },
};

/**
 * Chennai Logic Section - Primary angle benefit
 *
 * Design principles:
 * - One compelling benefit based on AI-detected primary angle
 * - Big visual + one stat
 * - Chennai-specific messaging for cooling/health
 */
export function ChennaiLogicSection({
  image,
  primaryAngle,
  language,
}: ChennaiLogicSectionProps) {
  const { colors, typography, radius, shadow, spacing } = smartQuoteTokens;

  const content = angleContent[primaryAngle];

  return (
    <section
      className={cn(
        colors.background.primary,
        spacing.section.mobile,
        spacing.section.tablet,
        spacing.section.desktop,
      )}
    >
      <div className={cn(spacing.container.maxWidth)}>
        {/* Section headline */}
        <h2
          className={cn(
            typography.headline.section,
            colors.text.primary,
            "text-center mb-8 md:mb-12",
          )}
        >
          {content.headline[language]}
        </h2>

        {/* Image with stat overlay */}
        {image && (
          <div className={cn("relative mb-8", radius.xl, "overflow-hidden")}>
            <div className="relative aspect-[16/10] md:aspect-[21/9]">
              <Image
                src={image.image_url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 80vw"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />

              {/* Stat badge */}
              <div className="absolute bottom-6 left-6 md:bottom-8 md:left-8">
                <div
                  className={cn(
                    "bg-white/95 backdrop-blur-sm",
                    radius.lg,
                    shadow.lg,
                    "px-5 py-4 md:px-6 md:py-5",
                  )}
                >
                  <p
                    className={cn(
                      "text-3xl md:text-4xl font-bold",
                      colors.accent.primary,
                    )}
                  >
                    {content.stat.value}
                  </p>
                  <p className={cn(typography.label.small, colors.text.muted)}>
                    {content.stat.label[language]}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Body text */}
        <p
          className={cn(
            typography.body.large,
            colors.text.secondary,
            "text-center max-w-xl mx-auto",
          )}
        >
          {content.body[language]}
        </p>
      </div>
    </section>
  );
}
