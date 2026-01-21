"use client";

import { useState } from "react";
import {
  HelpCircle,
  X,
  ChevronRight,
  Lightbulb,
  PlayCircle,
} from "lucide-react";
import Link from "next/link";
import {
  type ManualSection,
  type ManualContent,
  getManualContent,
} from "@/lib/user-manual";

interface HelpButtonProps {
  section: ManualSection;
  variant?: "icon" | "text" | "floating";
  className?: string;
}

export function HelpButton({
  section,
  variant = "icon",
  className = "",
}: HelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const content = getManualContent(section);

  if (!content) return null;

  return (
    <>
      {/* Trigger Button */}
      {variant === "floating" ? (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 hover:scale-105 ${className}`}
          aria-label="Help"
        >
          <HelpCircle className="h-6 w-6" />
        </button>
      ) : variant === "text" ? (
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 ${className}`}
        >
          <HelpCircle className="h-4 w-4" />
          <span>Help</span>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className={`rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-blue-400 ${className}`}
          aria-label="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      )}

      {/* Help Modal */}
      {isOpen && (
        <HelpModal content={content} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}

// ============================================================================
// HELP MODAL
// ============================================================================

interface HelpModalProps {
  content: ManualContent;
  onClose: () => void;
}

function HelpModal({ content, onClose }: HelpModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {content.title}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                {content.description}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
            {/* Quick Start */}
            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <PlayCircle className="h-4 w-4" />
                Quick Start
              </h3>
              <div className="space-y-2">
                {content.quickStart.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/20"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Step by Step */}
            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <ChevronRight className="h-4 w-4" />
                Step by Step
              </h3>
              <div className="space-y-3">
                {content.steps.map((step, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {step.action}
                        </p>
                        {step.result && (
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            → {step.result}
                          </p>
                        )}
                        {step.tip && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                            <Lightbulb className="h-3 w-3" />
                            {step.tip}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            {content.tips && content.tips.length > 0 && (
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <Lightbulb className="h-4 w-4" />
                  Pro Tips
                </h3>
                <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
                  <ul className="space-y-2">
                    {content.tips.map((tip, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200"
                      >
                        <span className="text-amber-500">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
            <Link
              href="/help"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              View Full User Manual →
            </Link>
            <button
              onClick={onClose}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HelpButton;
