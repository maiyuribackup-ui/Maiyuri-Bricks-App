"use client";

import Image from "next/image";
import { smartQuoteTokens, cn } from "../tokens";

interface ProofSectionProps {
  language: "en" | "ta";
}

// Placeholder project images - these would come from the database in production
const projectImages = [
  {
    url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop",
    caption: { en: "Adyar residence", ta: "அடையாறு குடியிருப்பு" },
  },
  {
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=600&fit=crop",
    caption: { en: "Velachery home", ta: "வேளச்சேரி வீடு" },
  },
  {
    url: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&h=600&fit=crop",
    caption: { en: "Tambaram project", ta: "தாம்பரம் திட்டம்" },
  },
];

/**
 * Proof Section - Project Image Teaser
 *
 * Design principles:
 * - 2-3 real project images in a grid
 * - Clean, minimal presentation
 * - Teaser style - shows it's real without overwhelming
 */
export function ProofSection({ language }: ProofSectionProps) {
  const { colors, typography, radius, spacing } = smartQuoteTokens;

  const title =
    language === "ta"
      ? "உண்மையான வீடுகள். உண்மையான குடும்பங்கள்."
      : "Real homes. Real families.";

  return (
    <section
      className={cn(
        colors.background.secondary,
        spacing.section.mobile,
        spacing.section.tablet,
        spacing.section.desktop,
      )}
    >
      <div className={cn(spacing.container.maxWidth)}>
        {/* Section Title */}
        <h2
          className={cn(
            typography.headline.section,
            colors.text.primary,
            "text-center mb-10 md:mb-12",
          )}
        >
          {title}
        </h2>

        {/* Project Images Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {projectImages.map((project, index) => (
            <div
              key={index}
              className={cn(
                "relative aspect-[4/3] overflow-hidden",
                radius["2xl"],
                "group cursor-pointer",
              )}
            >
              <Image
                src={project.url}
                alt={project.caption[language]}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              {/* Caption overlay */}
              <div
                className={cn(
                  "absolute bottom-0 left-0 right-0",
                  "bg-gradient-to-t from-black/70 to-transparent",
                  "p-4",
                )}
              >
                <p
                  className={cn(
                    typography.label.base,
                    "text-white font-medium",
                  )}
                >
                  {project.caption[language]}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Proof stat */}
        <div className="mt-10 text-center">
          <p
            className={cn(
              typography.body.large,
              colors.text.primary,
              "font-semibold",
            )}
          >
            {language === "ta"
              ? "150+ வீடுகள் கட்டப்பட்டன"
              : "150+ homes built"}
          </p>
          <p
            className={cn(typography.body.small, colors.text.secondary, "mt-2")}
          >
            {language === "ta"
              ? "சென்னை முழுவதும், 2020 முதல்"
              : "Across Chennai, since 2020"}
          </p>
        </div>
      </div>
    </section>
  );
}
