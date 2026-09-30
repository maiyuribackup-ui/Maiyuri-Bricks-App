/**
 * Smart Quote Design Tokens - Steve Jobs Style Redesign
 *
 * Premium, minimalist, eco-friendly design system for Smart Quote pages.
 * Mobile-first with sophisticated neutral palette inspired by Apple and Linear.
 *
 * Design Philosophy: "Steve Jobs style" - One idea per screen,
 * full-bleed visuals, minimal words, generous whitespace.
 *
 * Color Palette:
 * - Warm Off-White (#FBF7F2) - Primary background
 * - Pure White (#FFFFFF) - Cards and surfaces
 * - Deep Ink (#161616) - Primary text
 * - Warm Accent (#C46A2B) - CTAs and highlights
 * - Natural Success (#1E7F4D) - Trust indicators
 */

export const smartQuoteTokens = {
  colors: {
    // Backgrounds - Premium neutrals
    background: {
      primary: "bg-[#FBF7F2]", // Warm Off-White
      secondary: "bg-white", // Pure White - Cards
      hero: "bg-stone-900", // Dark for contrast with image
      card: "bg-white backdrop-blur-sm", // Clean cards
    },
    // Text - warm ink tones. Muted text is tinted from the ground's hue
    // rather than gray, and dark enough to clear WCAG AA on cream AND white.
    text: {
      primary: "text-[#161616]", // Deep Ink — 16.97:1 on cream
      secondary: "text-[#5B5B5B]", // Secondary — 6.37:1
      muted: "text-[#7d6653]", // Warm Muted — 4.97:1 on cream, 5.39:1 on white
      inverse: "text-white", // For dark backgrounds
    },
    // Accent — Red Soil, canonical per DESIGN.md.
    // Two values, because one cannot do both jobs at AA:
    //   #c0562f passes as a BUTTON FILL under white text (4.55:1)
    //   but only reaches 4.19:1 as TEXT on cream, so text uses the deep step.
    accent: {
      primary: "text-[#a8481f]", // Red Soil Deep — 5.36:1 as text on cream
      secondary: "text-[#8f3a18]", // Deeper still, for emphasis
      hover: "text-[#8f3a18]",
    },
    // CTA Button - Red Soil fill, white label
    cta: {
      bg: "bg-[#c0562f] hover:bg-[#a8481f]",
      text: "text-white",
      border: "border-[#c0562f]",
    },
    // Subtle decorative
    decorative: {
      line: "bg-[#efe3d2]", // Warm Border, canonical
      dot: "bg-[#c0562f]",
      gradient: "from-[#c0562f]/10 to-transparent",
    },
    // Trust/success colors
    trust: {
      bg: "bg-[#3f7d4d]/10",
      text: "text-[#3f7d4d]", // Cured Green — 5.00:1 on white
      icon: "text-[#3f7d4d]",
    },
  },

  spacing: {
    section: {
      mobile: "py-12 px-6",
      tablet: "md:py-16 md:px-10",
      desktop: "lg:py-20 lg:px-12",
    },
    container: {
      maxWidth: "max-w-[1040px] mx-auto", // Premium max width
      narrow: "max-w-[720px] mx-auto",
      wide: "max-w-[1200px] mx-auto",
    },
    gap: {
      xs: "gap-2",
      sm: "gap-4",
      md: "gap-6",
      lg: "gap-8",
      xl: "gap-12",
    },
    // Generous breathing room - Steve Jobs style
    breathe: {
      small: "mb-8",
      medium: "mb-12",
      large: "mb-20",
    },
  },

  typography: {
    headline: {
      // Steve Jobs style - Big, bold, memorable
      hero: "text-[34px] md:text-[44px] font-bold leading-[1.1] tracking-[-0.02em]",
      section:
        "text-[26px] md:text-[32px] font-bold leading-[1.2] tracking-[-0.01em]",
      subsection: "text-[20px] md:text-[24px] font-semibold leading-[1.3]",
      card: "text-[18px] md:text-[20px] font-semibold leading-[1.4]",
    },
    body: {
      large: "text-[18px] md:text-[20px] leading-[1.6]",
      base: "text-[16px] md:text-[18px] leading-[1.6]",
      small: "text-[14px] md:text-[16px] leading-[1.5]",
    },
    label: {
      base: "text-[14px] font-medium",
      small: "text-[12px] font-semibold uppercase tracking-[0.05em]",
    },
    // Personalization snippets - Friendly, conversational
    personalized: "text-[18px] md:text-[20px] leading-[1.6]",
  },

  radius: {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-[20px]", // Card radius
    "3xl": "rounded-3xl",
    button: "rounded-[14px]", // Button radius
    chip: "rounded-full", // Chip radius
    full: "rounded-full",
  },

  shadow: {
    none: "shadow-none",
    sm: "shadow-sm",
    md: "shadow-md",
    lg: "shadow-lg",
    xl: "shadow-xl",
    hero: "shadow-2xl",
    // Soft earthy shadow
    card: "shadow-[0_4px_20px_rgba(74,55,40,0.08)]",
  },

  transition: {
    fast: "transition-all duration-150 ease-out",
    base: "transition-all duration-300 ease-out",
    slow: "transition-all duration-500 ease-out",
  },

  animation: {
    fadeIn: "animate-fade-in",
    slideUp: "animate-slide-up",
  },
} as const;

/**
 * Combine multiple token values into a className string
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Get section classes with responsive spacing
 */
export function getSectionClasses(
  variant: "default" | "narrow" | "wide" = "default",
): string {
  const { spacing, colors } = smartQuoteTokens;
  const containerWidth =
    variant === "narrow"
      ? spacing.container.narrow
      : variant === "wide"
        ? spacing.container.wide
        : spacing.container.maxWidth;

  return cn(
    spacing.section.mobile,
    spacing.section.tablet,
    spacing.section.desktop,
    containerWidth,
    colors.background.primary,
  );
}
