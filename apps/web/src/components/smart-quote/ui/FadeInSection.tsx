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
  const elementRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={elementRef}
      className={cn(
        "transition-all duration-250 ease-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className,
      )}
      style={{
        transitionDelay: `${delay}ms`,
        transitionDuration: "250ms",
      }}
    >
      {children}
    </div>
  );
}
