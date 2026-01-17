"use client";

import { smartQuoteTokens, cn } from "../tokens";

interface CtaButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

/**
 * Primary CTA button for Smart Quote pages
 */
export function CtaButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className,
}: CtaButtonProps) {
  const { colors, typography, radius, shadow, transition } = smartQuoteTokens;

  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const variantClasses = {
    primary: cn(colors.cta.bg, colors.cta.text, shadow.md, "hover:shadow-lg"),
    secondary: cn(
      "bg-transparent",
      "border-2",
      colors.cta.border,
      colors.accent.primary,
      "hover:bg-amber-50 dark:hover:bg-amber-900/20",
    ),
    ghost: cn(
      "bg-transparent",
      colors.accent.primary,
      "hover:bg-stone-100 dark:hover:bg-stone-800",
    ),
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "font-medium",
        radius.lg,
        transition.base,
        sizeClasses[size],
        variantClasses[variant],
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "hover:scale-[1.02] active:scale-[0.98]",
        className,
      )}
    >
      {loading && (
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
      )}
      {children}
    </button>
  );
}

/**
 * Micro CTA link (smaller, inline)
 */
export function MicroCta({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const { colors, typography, transition } = smartQuoteTokens;

  return (
    <button
      onClick={onClick}
      className={cn(
        typography.body.small,
        colors.accent.primary,
        "underline underline-offset-4",
        "hover:no-underline",
        transition.fast,
        className,
      )}
    >
      {children} &rarr;
    </button>
  );
}
