"use client";

import { useState } from "react";
import { smartQuoteTokens, cn } from "../tokens";
import type {
  SmartQuoteObjection,
  SmartQuoteObjectionType,
} from "@maiyuri/shared";

interface ObjectionAnswerSectionProps {
  objections: SmartQuoteObjection[]; // Changed to array to support max 2
  language: "en" | "ta";
}

// Objection answers - addressing each concern directly
const objectionAnswers: Record<
  SmartQuoteObjectionType,
  {
    question: { en: string; ta: string };
    answer: { en: string; ta: string };
    proof: { en: string; ta: string };
  }
> = {
  price: {
    question: {
      en: '"Is it expensive?"',
      ta: '"இது விலை உயர்ந்ததா?"',
    },
    answer: {
      en: "The upfront cost is similar to conventional bricks. But you save 25-35% on overall construction due to faster building time, less cement, and lower maintenance.",
      ta: "ஆரம்ப செலவு வழக்கமான செங்கற்களைப் போன்றது. ஆனால் வேகமான கட்டுமான நேரம், குறைவான சிமெண்ட் மற்றும் குறைந்த பராமரிப்பு காரணமாக 25-35% சேமிக்கிறீர்கள்.",
    },
    proof: {
      en: "150+ Chennai families have already made the switch.",
      ta: "150+ சென்னை குடும்பங்கள் ஏற்கனவே மாற்றத்தைச் செய்துள்ளன.",
    },
  },
  strength: {
    question: {
      en: '"Are they strong enough?"',
      ta: '"அவை போதுமான வலிமையானவையா?"',
    },
    answer: {
      en: "Earth blocks have higher compressive strength than regular bricks. They're used in earthquake-prone regions worldwide. Your home will be safer.",
      ta: "மண் செங்கற்கள் வழக்கமான செங்கற்களை விட அதிக அழுத்த வலிமை கொண்டவை. உலகெங்கிலும் பூகம்பம் எளிதில் வரக்கூடிய பகுதிகளில் பயன்படுத்தப்படுகின்றன.",
    },
    proof: {
      en: "Our blocks exceed IS standards for compressive strength.",
      ta: "எங்கள் செங்கற்கள் IS தரநிலைகளை விட அதிக வலிமை கொண்டவை.",
    },
  },
  water: {
    question: {
      en: '"What about water damage?"',
      ta: '"தண்ணீர் சேதம் பற்றி என்ன?"',
    },
    answer: {
      en: "Our blocks are specially treated for Chennai's monsoon. Proper waterproofing during construction keeps your walls safe for decades.",
      ta: "எங்கள் செங்கற்கள் சென்னையின் பருவமழைக்கு சிறப்பாக சிகிச்சை அளிக்கப்படுகின்றன. கட்டுமானத்தின் போது சரியான நீர்ப்புகா உங்கள் சுவர்களை பத்தாண்டுகளுக்கு பாதுகாக்கிறது.",
    },
    proof: {
      en: "Homes built 10+ years ago still standing strong.",
      ta: "10+ ஆண்டுகளுக்கு முன் கட்டப்பட்ட வீடுகள் இன்னும் உறுதியாக உள்ளன.",
    },
  },
  approval: {
    question: {
      en: '"Will my family approve?"',
      ta: '"என் குடும்பம் ஒப்புக்கொள்ளுமா?"',
    },
    answer: {
      en: "We're happy to speak with your family or show them completed homes. Seeing is believing—and most families are impressed when they see the quality.",
      ta: "உங்கள் குடும்பத்துடன் பேச அல்லது முடிக்கப்பட்ட வீடுகளைக் காட்ட நாங்கள் மகிழ்ச்சியடைகிறோம். பார்ப்பதே நம்பிக்கை—பெரும்பாலான குடும்பங்கள் தரத்தைப் பார்க்கும்போது ஈர்க்கப்படுகிறார்கள்.",
    },
    proof: {
      en: "Visit our factory or a completed project anytime.",
      ta: "எப்போது வேண்டுமானாலும் எங்கள் தொழிற்சாலை அல்லது முடிக்கப்பட்ட திட்டத்தைப் பார்வையிடுங்கள்.",
    },
  },
  maintenance: {
    question: {
      en: '"What about long-term maintenance?"',
      ta: '"நீண்ட கால பராமரிப்பு என்ன?"',
    },
    answer: {
      en: "Earth blocks require less maintenance than conventional walls. No chipping, no frequent repainting. The natural finish actually improves with age.",
      ta: "மண் செங்கற்களுக்கு வழக்கமான சுவர்களை விட குறைவான பராமரிப்பு தேவை. சிதைவு இல்லை, அடிக்கடி வண்ணம் தீட்டுதல் இல்லை. இயற்கை பூச்சு வயதாகும்போது உண்மையில் மேம்படுகிறது.",
    },
    proof: {
      en: "Lower lifetime cost of ownership.",
      ta: "குறைந்த வாழ்நாள் உரிமைச் செலவு.",
    },
  },
  resale: {
    question: {
      en: '"Will it affect resale value?"',
      ta: '"இது மறுவிற்பனை மதிப்பை பாதிக்குமா?"',
    },
    answer: {
      en: "Eco-friendly homes are in growing demand. Buyers appreciate sustainable construction, unique aesthetics, and lower energy bills.",
      ta: "சுற்றுச்சூழல் நட்பு வீடுகளுக்கு வளர்ந்து வரும் தேவை உள்ளது. நிலையான கட்டுமானம், தனித்துவமான அழகியல் மற்றும் குறைந்த மின்சார கட்டணங்களை வாங்குபவர்கள் பாராட்டுகிறார்கள்.",
    },
    proof: {
      en: "Premium pricing for green-certified properties.",
      ta: "பசுமை சான்றளிக்கப்பட்ட சொத்துக்களுக்கு பிரீமியம் விலை.",
    },
  },
  contractor_acceptance: {
    question: {
      en: '"Will my contractor know how to work with this?"',
      ta: '"என் ஒப்பந்தக்காரருக்கு இதை எப்படி வேலை செய்வது என்று தெரியுமா?"',
    },
    answer: {
      en: "We provide on-site training for your contractor at no extra cost. The techniques are actually simpler than conventional construction.",
      ta: "உங்கள் ஒப்பந்தக்காரருக்கு கூடுதல் செலவின்றி தள பயிற்சி வழங்குகிறோம். நுட்பங்கள் உண்மையில் வழக்கமான கட்டுமானத்தை விட எளிமையானவை.",
    },
    proof: {
      en: "Free contractor training included.",
      ta: "இலவச ஒப்பந்தக்காரர் பயிற்சி உள்ளடக்கியது.",
    },
  },
};

/**
 * Objection Answer Section - Accordion Style
 *
 * Design principles:
 * - Max 2 objections in accordion format
 * - Question → Answer → Proof format
 * - Empathetic, not defensive
 * - Clean, minimal accordion interaction
 */
export function ObjectionAnswerSection({
  objections,
  language,
}: ObjectionAnswerSectionProps) {
  const { colors, typography, radius, spacing } = smartQuoteTokens;

  // Only show max 2 objections
  const displayObjections = objections.slice(0, 2);

  // Track which accordion item is open (default first one open)
  const [openIndex, setOpenIndex] = useState<number>(0);

  const title = language === "ta" ? "நீங்கள் கேட்கலாம்..." : "Common questions";

  return (
    <section
      className={cn(
        colors.background.secondary,
        spacing.section.mobile,
        spacing.section.tablet,
        spacing.section.desktop,
      )}
    >
      <div className={cn(spacing.container.narrow)}>
        {/* Section title */}
        <h2
          className={cn(
            typography.headline.section,
            colors.text.primary,
            "text-center mb-10 md:mb-12",
          )}
        >
          {title}
        </h2>

        {/* Accordion items */}
        <div className="space-y-4">
          {displayObjections.map((objection, index) => {
            const answer = objectionAnswers[objection.type];
            const isOpen = openIndex === index;

            return (
              <div
                key={index}
                className={cn(
                  "bg-white",
                  radius["2xl"],
                  "border border-[#E8DED2]",
                  "overflow-hidden",
                  "transition-all duration-200",
                )}
              >
                {/* Accordion header - clickable */}
                <button
                  className={cn(
                    "w-full px-6 py-5 md:px-8 md:py-6",
                    "flex items-center justify-between",
                    "text-left",
                    "transition-colors duration-200",
                    "hover:bg-[#FBF7F2]/50",
                  )}
                  onClick={() => setOpenIndex(isOpen ? -1 : index)}
                >
                  <span
                    className={cn(
                      typography.headline.card,
                      colors.text.primary,
                    )}
                  >
                    {answer.question[language].replace(/"/g, "")}
                  </span>

                  {/* Chevron icon */}
                  <svg
                    className={cn(
                      "w-5 h-5",
                      colors.text.muted,
                      "transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Accordion content */}
                {isOpen && (
                  <div className="px-6 pb-6 md:px-8 md:pb-8">
                    {/* The answer */}
                    <p
                      className={cn(
                        typography.body.base,
                        colors.text.secondary,
                        "mb-4",
                      )}
                    >
                      {answer.answer[language]}
                    </p>

                    {/* Proof point */}
                    <div
                      className={cn(
                        "inline-flex items-center gap-2",
                        "px-4 py-2",
                        radius.chip,
                        colors.trust.bg,
                      )}
                    >
                      <svg
                        className={cn("w-4 h-4", colors.trust.icon)}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span
                        className={cn(typography.body.small, colors.trust.text)}
                      >
                        {answer.proof[language]}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
