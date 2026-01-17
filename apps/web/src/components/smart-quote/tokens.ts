/**
 * Smart Quote Design Tokens
 *
 * Premium, calm, eco-friendly design system for Smart Quote pages.
 * Mobile-first with earth-inspired color palette.
 *
 * Design Philosophy: "Steve Jobs style" - One idea per screen,
 * big visuals, few words, breathing room.
 *
 * Color Palette:
 * - Warm Sand (#F5F0E8) - Primary background
 * - Terracotta (#C87941) - CTA and accents
 * - Deep Earth Brown (#4A3728) - Headlines
 * - Soft Cream (#FFF9F0) - Cards
 */

export const smartQuoteTokens = {
  colors: {
    // Backgrounds - Earthy tones
    background: {
      primary: "bg-[#F5F0E8]", // Warm Sand
      secondary: "bg-[#FFF9F0]", // Soft Cream - Cards
      hero: "bg-stone-900", // Dark for contrast with image
      card: "bg-white/90 backdrop-blur-sm", // Glass-morphism card
    },
    // Text - Deep earth tones
    text: {
      primary: "text-[#4A3728]", // Deep Earth Brown
      secondary: "text-[#6B5B4F]", // Medium brown
      muted: "text-[#8B7B6B]", // Light brown
      inverse: "text-white", // For dark backgrounds
    },
    // Accent - Terracotta
    accent: {
      primary: "text-[#C87941]", // Terracotta
      secondary: "text-[#A66A38]", // Darker terracotta
      hover: "text-[#B56B35]", // Hover state
    },
    // CTA Button - Terracotta
    cta: {
      bg: "bg-[#C87941] hover:bg-[#B56B35]",
      text: "text-white",
      border: "border-[#C87941]",
    },
    // Subtle decorative
    decorative: {
      line: "bg-[#C87941]/20",
      dot: "bg-[#C87941]",
      gradient: "from-[#C87941]/10 to-transparent",
    },
    // Trust/success colors
    trust: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      icon: "text-emerald-600",
    },
  },

  spacing: {
    section: {
      mobile: "py-12 px-5",
      tablet: "md:py-16 md:px-8",
      desktop: "lg:py-24 lg:px-12",
    },
    container: {
      maxWidth: "max-w-2xl mx-auto", // Narrower for focus
      narrow: "max-w-xl mx-auto",
      wide: "max-w-3xl mx-auto",
    },
    gap: {
      xs: "gap-2",
      sm: "gap-4",
      md: "gap-6",
      lg: "gap-8",
      xl: "gap-12",
    },
    // Generous breathing room
    breathe: {
      small: "mb-6",
      medium: "mb-10",
      large: "mb-16",
    },
  },

  typography: {
    headline: {
      // Steve Jobs style - Big, bold, memorable
      hero: "text-3xl md:text-4xl lg:text-5xl font-bold leading-tight tracking-tight",
      section: "text-2xl md:text-3xl font-bold leading-snug tracking-tight",
      subsection: "text-xl md:text-2xl font-semibold leading-snug",
      card: "text-lg md:text-xl font-semibold leading-snug",
    },
    body: {
      large: "text-lg md:text-xl leading-relaxed",
      base: "text-base md:text-lg leading-relaxed",
      small: "text-sm md:text-base leading-relaxed",
    },
    label: {
      base: "text-sm font-medium tracking-wide",
      small: "text-xs font-semibold uppercase tracking-wider",
    },
    // Personalization snippets - Friendly, conversational
    personalized: "text-lg md:text-xl leading-relaxed italic",
  },

  radius: {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-2xl",
    "3xl": "rounded-3xl",
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
