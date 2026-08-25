"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../tokens";

interface FadeInSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

/**
 * FadeInSection - Smooth fade-up animation on scroll
 *
 * Design:
 * - Fades up 8px with 250ms duration
 * - Triggers when element enters viewport
 * - Optional delay for staggered animations
 */
export function FadeInSection({
  children,
  className,
  delay = 0,
}: FadeInSectionProps) {
  const [isVisible, setIsVisible] = useState(false);
  // Readers who ask for reduced motion get the content already in place —
  // not a 0.01ms version of the same slide. Nothing fades, nothing moves, and
  // no section can be missed because its reveal never fired.
  const [reduceMotion, setReduceMotion] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Unobserve after animation triggers (performance optimization)
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }, // Trigger when 10% visible
    );

    const currentElement = elementRef.current;
    if (currentElement) {
      observer.observe(currentElement);
    }

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
    };
  }, []);

  const shown = isVisible || reduceMotion;

  return (
    <div
      ref={elementRef}
      className={cn(
        !reduceMotion && "transition-all duration-250 ease-out",
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className,
      )}
      style={
        reduceMotion
          ? undefined
          : { transitionDelay: `${delay}ms`, transitionDuration: "250ms" }
      }
    >
      {children}
    </div>
  );
}
