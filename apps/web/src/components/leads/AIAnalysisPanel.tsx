"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Badge, Spinner } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import type { Lead } from "@maiyuri/shared";

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

interface AIAnalysisPanelProps {
  lead: Lead;
  onAnalysisComplete?: () => void;
}

async function analyzeLead(id: string): Promise<{
  success: boolean;
  data?: { lead: Lead; analysis: AnalysisResult };
}> {
  const res = await fetch(`/api/leads/${id}/analyze`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to analyze lead");
  return res.json();
}

interface PredictionFactor {
  name: string;
  value: number;
  impact: "positive" | "negative" | "neutral";
  weight: number;
}

interface PredictionResult {
  probability: number;
  confidence: number;
  factors: PredictionFactor[];
}

async function predictConversion(
  leadId: string,
): Promise<{ success: boolean; data?: PredictionResult }> {
  const res = await fetch("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId }),
  });
  if (!res.ok) throw new Error("Failed to predict conversion");
  return res.json();
}

export function AIAnalysisPanel({
  lead,
  onAnalysisComplete,
}: AIAnalysisPanelProps) {
  const queryClient = useQueryClient();
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [predictionResult, setPredictionResult] =
    useState<PredictionResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeLead(lead.id),
    onSuccess: (data) => {
      if (data.data?.analysis) {
        setAnalysisResult(data.data.analysis);
      }
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      onAnalysisComplete?.();
    },
  });

  const predictMutation = useMutation({
    mutationFn: () => predictConversion(lead.id),
    onSuccess: (data) => {
      if (data.data) {
        setPredictionResult(data.data);
      }
    },
  });

  const hasAIData = lead.ai_score !== null && lead.ai_score !== undefined;
  const factorItems = analysisResult?.factors || lead.ai_factors || [];
  const suggestionItems =
    analysisResult?.suggestions || lead.ai_suggestions || [];
  const isAnalyzing = analyzeMutation.isPending;
  const isPredicting = predictMutation.isPending;

  return (
    <div className="space-y-4">
      {/* AI Score Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-blue-500" />
            AI Analysis
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => analyzeMutation.mutate()}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? <Spinner size="sm" /> : "Analyze"}
          </Button>
        </div>

        {hasAIData ? (
          <div className="space-y-4">
            {/* Score Display */}
            <div className="flex items-center gap-4">
              <ScoreRing score={lead.ai_score!} />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {getScoreLabel(lead.ai_score!)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Conversion probability
                </p>
              </div>
            </div>

            {/* Summary */}
            {lead.ai_summary && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {lead.ai_summary}
                </p>
              </div>
            )}

            {/* Next Action */}
            {lead.next_action && (
              <div className="flex items-start gap-2">
                <LightbulbIcon className="h-4 w-4 text-yellow-500 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Next Action
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {lead.next_action}
                  </p>
                </div>
              </div>
            )}

            {/* Follow-up Date */}
            {lead.follow_up_date && (
              <div className="flex items-start gap-2">
                <CalendarIcon className="h-4 w-4 text-blue-500 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Follow-up Date
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {new Date(lead.follow_up_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}

            {/* Detailed Analysis (collapsible) */}
            {(analysisResult ||
              factorItems.length > 0 ||
              suggestionItems.length > 0) && (
              <>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full flex items-center justify-between text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  <span>{showDetails ? "Hide Details" : "Show Details"}</span>
                  <ChevronIcon
                    className={cn(
                      "h-4 w-4 transition-transform",
                      showDetails && "rotate-180",
                    )}
                  />
                </button>

                {showDetails && (
                  <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    {/* Score Factors */}
                    {factorItems.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                          Score Factors
                        </h4>
                        <div className="space-y-1">
                          {factorItems.map((factor, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span
                                className={cn(
                                  "w-2 h-2 rounded-full",
                                  factor.impact === "positive" &&
                                    "bg-green-500",
                                  factor.impact === "negative" && "bg-red-500",
                                  factor.impact === "neutral" && "bg-slate-400",
                                )}
                              />
                              <span className="text-slate-600 dark:text-slate-300">
                                {factor.factor}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggestions */}
                    {suggestionItems.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                          AI Suggestions
                        </h4>
                        <div className="space-y-2">
                          {suggestionItems.map((suggestion, idx) => (
                            <div
                              key={idx}
                              className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Badge
                                  variant={
                                    suggestion.priority === "high"
                                      ? "danger"
                                      : suggestion.priority === "medium"
                                        ? "warning"
                                        : "default"
                                  }
                                >
                                  {suggestion.priority}
                                </Badge>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {suggestion.type}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                {suggestion.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <SparklesIcon className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              No AI analysis yet
            </p>
            <Button
              size="sm"
              onClick={() => analyzeMutation.mutate()}
              disabled={isAnalyzing}
              className="mt-3"
            >
              {isAnalyzing ? "Analyzing..." : "Generate Analysis"}
            </Button>
          </div>
        )}
      </Card>

      {/* Conversion Prediction Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <ChartIcon className="h-4 w-4 text-green-500" />
            Conversion Prediction
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => predictMutation.mutate()}
            disabled={isPredicting}
          >
            {isPredicting ? <Spinner size="sm" /> : "Predict"}
          </Button>
        </div>

        {predictionResult ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div
                  className={cn(
                    "text-3xl font-bold",
                    predictionResult.probability >= 0.7
                      ? "text-green-600 dark:text-green-400"
                      : predictionResult.probability >= 0.4
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-red-600 dark:text-red-400",
                  )}
                >
                  {Math.round(predictionResult.probability * 100)}%
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Probability
                </p>
              </div>
              <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    predictionResult.probability >= 0.7
                      ? "bg-green-500"
                      : predictionResult.probability >= 0.4
                        ? "bg-yellow-500"
                        : "bg-red-500",
                  )}
                  style={{ width: `${predictionResult.probability * 100}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Confidence: {Math.round(predictionResult.confidence * 100)}%
              </span>
            </div>

            {predictionResult.factors &&
              predictionResult.factors.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                    Key Factors
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {predictionResult.factors.map((factor, idx) => (
                      <Badge
                        key={idx}
                        variant={
                          factor.impact === "positive"
                            ? "success"
                            : factor.impact === "negative"
                              ? "danger"
                              : "default"
                        }
                      >
                        {factor.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Click Predict to get conversion probability
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

// Score Ring Component
function ScoreRing({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - score * circumference;

  const getColor = (s: number) => {
    if (s >= 0.7) return "text-green-500";
    if (s >= 0.4) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="relative w-14 h-14">
      <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          className="stroke-slate-200 dark:stroke-slate-700"
          strokeWidth="4"
        />
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          className={cn("stroke-current", getColor(score))}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-sm font-bold", getColor(score))}>
          {percentage}
        </span>
      </div>
    </div>
  );
}

function getScoreLabel(score: number): string {
  if (score >= 0.8) return "Very High Potential";
  if (score >= 0.6) return "High Potential";
  if (score >= 0.4) return "Medium Potential";
  if (score >= 0.2) return "Low Potential";
  return "Very Low Potential";
}

// Icon Components
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

function CalendarIcon({ className }: { className?: string }) {
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
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
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

export default AIAnalysisPanel;
