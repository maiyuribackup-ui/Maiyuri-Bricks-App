"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Badge, Spinner } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import type { Lead, LeadUrgency, ConversionLever } from "@maiyuri/shared";

interface UnifiedAIInsightsProps {
  lead: Lead;
  onRefresh?: () => void;
}

interface AnalysisResult {
  summary: string;
  score: number;
  nextAction: string;
  followUpDate?: string;
  factors: Array<{
    factor: string;
    impact: "positive" | "negative" | "neutral";
  }>;
  suggestions: Array<{
    type: string;
    content: string;
    priority: "high" | "medium" | "low";
  }>;
}

async function analyzeLead(
  id: string,
): Promise<{
  success: boolean;
  data?: { lead: Lead; analysis: AnalysisResult };
}> {
  const res = await fetch(`/api/leads/${id}/analyze`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to analyze lead");
  return res.json();
}

/**
 * Unified AI Insights Component
 * Combines LeadIntelligenceSummary and AIAnalysisPanel into a single header section
 * Issue #24: Merge dual AI Analyze buttons
 */
export function UnifiedAIInsights({ lead, onRefresh }: UnifiedAIInsightsProps) {
  const queryClient = useQueryClient();
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [showDetails, setShowDetails] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeLead(lead.id),
    onSuccess: (data) => {
      if (data.data?.analysis) {
        setAnalysisResult(data.data.analysis);
      }
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      onRefresh?.();
    },
  });

  const hasAIData = lead.ai_score !== null && lead.ai_score !== undefined;
  const isAnalyzing = analyzeMutation.isPending;
  const factorItems = analysisResult?.factors || lead.ai_factors || [];
  const suggestionItems =
    analysisResult?.suggestions || lead.ai_suggestions || [];

  // If no intelligence data, show generate prompt (compact)
  if (!hasAIData) {
    return (
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/50">
              <SparklesIcon className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Generate AI Intelligence
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Analyze calls and notes to get actionable insights
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => analyzeMutation.mutate()}
            disabled={isAnalyzing}
            className="gap-2"
          >
            {isAnalyzing ? (
              <>
                <Spinner size="sm" />
                Analyzing...
              </>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                Analyze
              </>
            )}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Main Insights Row - Always Visible */}
      <div className="p-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
        <div className="flex flex-wrap items-center gap-4">
          {/* Score Ring - Primary Focus */}
          <div className="flex items-center gap-3 shrink-0">
            <ScoreRing score={lead.ai_score ?? 0} />
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                AI Score
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {getScoreLabel(lead.ai_score ?? 0)}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Quick Insight Cards - Horizontal Scroll on Mobile */}
          <div className="flex-1 flex items-center gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {/* Urgency */}
            {lead.urgency && (
              <InsightChip
                label="Urgency"
                icon={<UrgencyIcon urgency={lead.urgency} />}
              >
                <UrgencyBadge urgency={lead.urgency} />
              </InsightChip>
            )}

            {/* Dominant Objection */}
            {lead.dominant_objection && (
              <InsightChip
                label="Objection"
                icon={<WarningIcon className="h-4 w-4 text-red-500" />}
                variant="warning"
              >
                <span className="text-xs font-medium text-red-700 dark:text-red-300 truncate max-w-[120px]">
                  {lead.dominant_objection}
                </span>
              </InsightChip>
            )}

            {/* Best Conversion Lever */}
            {lead.best_conversion_lever && (
              <InsightChip
                label="Best Move"
                icon={<LeverIcon lever={lead.best_conversion_lever} />}
                variant="success"
              >
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {getLeverLabel(lead.best_conversion_lever)}
                </span>
              </InsightChip>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              {showDetails ? "Less" : "More"}
              <ChevronIcon
                className={cn(
                  "h-4 w-4 ml-1 transition-transform",
                  showDetails && "rotate-180",
                )}
              />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => analyzeMutation.mutate()}
              disabled={isAnalyzing}
              className="gap-1.5"
            >
              {isAnalyzing ? (
                <Spinner size="sm" />
              ) : (
                <RefreshIcon className="h-4 w-4" />
              )}
              {isAnalyzing ? "Analyzing..." : "Re-analyze"}
            </Button>
          </div>
        </div>

        {/* Next Action - Always visible when available */}
        {lead.next_action && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-2">
            <LightbulbIcon className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-medium">Next:</span> {lead.next_action}
            </p>
            {lead.follow_up_date && (
              <Badge variant="default" className="ml-auto shrink-0">
                {new Date(lead.follow_up_date).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                })}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Expanded Details Section */}
      {showDetails && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI Summary */}
            {lead.ai_summary && (
              <div className="md:col-span-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900">
                <div className="flex items-start gap-2">
                  <SparklesIcon className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                      AI Summary
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      {lead.ai_summary}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Score Factors */}
            {factorItems.length > 0 && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                  <ChartIcon className="h-3.5 w-3.5" />
                  Score Factors
                </h4>
                <div className="space-y-1.5">
                  {factorItems.slice(0, 5).map((factor, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          factor.impact === "positive" && "bg-emerald-500",
                          factor.impact === "negative" && "bg-red-500",
                          factor.impact === "neutral" && "bg-slate-400",
                        )}
                      />
                      <span className="text-slate-600 dark:text-slate-300 truncate">
                        {factor.factor}
                      </span>
                    </div>
                  ))}
                  {factorItems.length > 5 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      +{factorItems.length - 5} more factors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* AI Suggestions */}
            {suggestionItems.length > 0 && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                  <LightbulbIcon className="h-3.5 w-3.5" />
                  AI Suggestions
                </h4>
                <div className="space-y-2">
                  {suggestionItems.slice(0, 3).map((suggestion, idx) => (
                    <div key={idx} className="text-sm">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Badge
                          variant={
                            suggestion.priority === "high"
                              ? "danger"
                              : suggestion.priority === "medium"
                                ? "warning"
                                : "default"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {suggestion.priority}
                        </Badge>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {suggestion.type}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 line-clamp-2">
                        {suggestion.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state for details */}
            {!lead.ai_summary &&
              factorItems.length === 0 &&
              suggestionItems.length === 0 && (
                <div className="md:col-span-2 text-center py-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Click &quot;Re-analyze&quot; to generate detailed insights
                  </p>
                </div>
              )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface InsightChipProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "warning" | "success";
}

function InsightChip({
  label,
  icon,
  children,
  variant = "default",
}: InsightChipProps) {
  const bgColor = {
    default: "bg-slate-100 dark:bg-slate-800",
    warning: "bg-red-50 dark:bg-red-950/30",
    success: "bg-emerald-50 dark:bg-emerald-950/30",
  };

  return (
    <div
      className={cn(
        "flex flex-col px-3 py-2 rounded-lg shrink-0",
        bgColor[variant],
      )}
    >
      <span className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const circumference = 2 * Math.PI * 16;
  const strokeDashoffset = circumference - score * circumference;

  const getColor = (s: number) => {
    if (s >= 0.7)
      return {
        ring: "text-emerald-500",
        text: "text-emerald-600 dark:text-emerald-400",
      };
    if (s >= 0.4)
      return {
        ring: "text-amber-500",
        text: "text-amber-600 dark:text-amber-400",
      };
    return { ring: "text-red-500", text: "text-red-600 dark:text-red-400" };
  };

  const colors = getColor(score);

  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          className="stroke-slate-200 dark:stroke-slate-700"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          className={cn(
            "stroke-current transition-all duration-500",
            colors.ring,
          )}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-sm font-bold", colors.text)}>
          {percentage}%
        </span>
      </div>
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: LeadUrgency }) {
  const config = {
    immediate: { label: "Immediate", variant: "danger" as const },
    "1-3_months": { label: "1-3 mo", variant: "warning" as const },
    "3-6_months": { label: "3-6 mo", variant: "default" as const },
    unknown: { label: "Unknown", variant: "default" as const },
  };

  const { label, variant } = config[urgency] || config.unknown;

  return (
    <Badge variant={variant} className="text-xs">
      {label}
    </Badge>
  );
}

function UrgencyIcon({ urgency }: { urgency: LeadUrgency }) {
  const color = {
    immediate: "text-red-500",
    "1-3_months": "text-amber-500",
    "3-6_months": "text-slate-400",
    unknown: "text-slate-400",
  };

  return (
    <ClockIcon className={cn("h-3.5 w-3.5", color[urgency] || color.unknown)} />
  );
}

function LeverIcon({ lever }: { lever: ConversionLever }) {
  const icons: Record<ConversionLever, React.ReactNode> = {
    proof: <CheckBadgeIcon className="h-3.5 w-3.5 text-blue-500" />,
    price: <CurrencyIcon className="h-3.5 w-3.5 text-emerald-500" />,
    visit: <BuildingIcon className="h-3.5 w-3.5 text-purple-500" />,
    relationship: <HeartIcon className="h-3.5 w-3.5 text-pink-500" />,
    timeline: <ClockIcon className="h-3.5 w-3.5 text-amber-500" />,
  };

  return icons[lever] || icons.proof;
}

function getLeverLabel(lever: ConversionLever): string {
  const labels: Record<ConversionLever, string> = {
    proof: "Show Proof",
    price: "Negotiate",
    visit: "Site Visit",
    relationship: "Build Trust",
    timeline: "Fast Delivery",
  };
  return labels[lever] || lever;
}

function getScoreLabel(score: number): string {
  if (score >= 0.8) return "Very High";
  if (score >= 0.6) return "High";
  if (score >= 0.4) return "Medium";
  if (score >= 0.2) return "Low";
  return "Very Low";
}

// ============================================================================
// Icons
// ============================================================================

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function CheckBadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
      />
    </svg>
  );
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 8.25H9m6 3H9m3 6l-3-3h1.5a3 3 0 100-6M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
      />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );
}

export default UnifiedAIInsights;
