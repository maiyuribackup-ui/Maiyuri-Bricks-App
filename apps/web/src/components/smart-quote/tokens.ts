/**
 * Smart Quote Design Tokens
 *
 * Premium, calm, eco-friendly design system for Smart Quote pages.
 * Mobile-first with earth-inspired color palette.
 */

export const smartQuoteTokens = {
  colors: {
    // Backgrounds
    background: {
      primary: "bg-stone-50 dark:bg-stone-900",
      secondary: "bg-stone-100 dark:bg-stone-800",
      hero: "bg-stone-200 dark:bg-stone-800",
    },
    // Text
    text: {
      primary: "text-stone-800 dark:text-stone-100",
      secondary: "text-stone-600 dark:text-stone-300",
      muted: "text-stone-500 dark:text-stone-400",
    },
    // Accent (earth/amber tones)
    accent: {
      primary: "text-amber-700 dark:text-amber-400",
      secondary: "text-amber-600 dark:text-amber-500",
      hover: "text-amber-800 dark:text-amber-300",
    },
    // CTA Button
    cta: {
      bg: "bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500",
      text: "text-white",
      border: "border-amber-600 dark:border-amber-500",
    },
    // Subtle decorative
    decorative: {
      line: "bg-amber-200 dark:bg-amber-800",
      dot: "bg-amber-400 dark:bg-amber-600",
    },
  },

  spacing: {
    section: {
      mobile: "py-10 px-4",
      tablet: "md:py-14 md:px-6",
      desktop: "lg:py-20 lg:px-8",
    },
    container: {
      maxWidth: "max-w-3xl mx-auto",
      narrow: "max-w-2xl mx-auto",
      wide: "max-w-4xl mx-auto",
    },
    gap: {
      xs: "gap-2",
      sm: "gap-4",
      md: "gap-6",
      lg: "gap-8",
      xl: "gap-12",
    },
  },

  typography: {
    headline: {
      hero: "text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight",
      section: "text-xl md:text-2xl font-semibold leading-snug",
      subsection: "text-lg md:text-xl font-medium leading-snug",
    },
    body: {
      large: "text-lg md:text-xl leading-relaxed",
      base: "text-base md:text-lg leading-relaxed",
      small: "text-sm md:text-base leading-relaxed",
    },
    label: {
      base: "text-sm font-medium",
      small: "text-xs font-medium uppercase tracking-wider",
    },
  },

  radius: {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-2xl",
    full: "rounded-full",
  },

  shadow: {
    none: "shadow-none",
    sm: "shadow-sm",
    md: "shadow-md",
    lg: "shadow-lg",
    hero: "shadow-xl",
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
