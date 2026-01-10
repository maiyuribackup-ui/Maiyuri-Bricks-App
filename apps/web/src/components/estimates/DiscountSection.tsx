'use client';

import { Card, Button, Spinner } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';

interface AISuggestion {
  percentage: number;
  reasoning: string;
  confidence: number;
}

interface DiscountSectionProps {
  discountPercentage: number;
  discountReason: string;
  aiSuggestion: AISuggestion | null;
  onDiscountChange: (percentage: number) => void;
  onReasonChange: (reason: string) => void;
  onGetAISuggestion: () => void;
  onApplyAISuggestion: () => void;
  isLoadingSuggestion: boolean;
  hasItems: boolean;
}

export function DiscountSection({
  discountPercentage,
  discountReason,
  aiSuggestion,
  onDiscountChange,
  onReasonChange,
  onGetAISuggestion,
  onApplyAISuggestion,
  isLoadingSuggestion,
  hasItems,
}: DiscountSectionProps) {
  const confidenceColor = aiSuggestion
    ? aiSuggestion.confidence >= 0.8
      ? 'text-green-600 dark:text-green-400'
      : aiSuggestion.confidence >= 0.5
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'
    : '';

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium text-slate-900 dark:text-white">
        Discount
      </h3>

      <div className="space-y-4">
        {/* AI Suggestion Section */}
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
          <div className="mb-2 flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <span className="font-medium text-purple-700 dark:text-purple-300">
              AI Discount Advisor
            </span>
          </div>

          {aiSuggestion ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                    {aiSuggestion.percentage}%
                  </span>
                  <span className={cn('ml-2 text-sm', confidenceColor)}>
                    ({(aiSuggestion.confidence * 100).toFixed(0)}% confident)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onApplyAISuggestion}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
                >
                  Apply
                </button>
              </div>
              <p className="text-sm text-purple-600 dark:text-purple-400">
                {aiSuggestion.reasoning}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="mb-2 text-sm text-purple-600 dark:text-purple-400">
                Get AI-powered discount recommendation based on lead analysis
              </p>
              <button
                type="button"
                onClick={onGetAISuggestion}
                disabled={!hasItems || isLoadingSuggestion}
                className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingSuggestion ? (
                  <>
                    <Spinner size="sm" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-4 w-4" />
                    Get AI Suggestion
                  </>
                )}
              </button>
              {!hasItems && (
                <p className="mt-1 text-xs text-purple-500">
                  Add products first to get AI suggestion
                </p>
              )}
            </div>
          )}
        </div>

        {/* Manual Discount Input */}
        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">
            Manual Discount
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={discountPercentage}
              onChange={(e) => onDiscountChange(parseInt(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-amber-500 dark:bg-slate-700"
            />
            <div className="flex w-20 items-center gap-1">
              <input
                type="number"
                min={0}
                max={50}
                value={discountPercentage}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  onDiscountChange(Math.min(50, Math.max(0, value)));
                }}
                className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-center text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
              <span className="text-slate-500">%</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Maximum: 50%
          </p>
        </div>

        {/* Discount Reason */}
        {discountPercentage > 0 && (
          <div>
            <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">
              Discount Reason
            </label>
            <input
              type="text"
              value={discountReason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Enter reason for discount..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>
        )}

        {/* Quick Discount Buttons */}
        <div>
          <label className="mb-2 block text-xs text-slate-500 dark:text-slate-400">
            Quick Select
          </label>
          <div className="flex flex-wrap gap-2">
            {[0, 5, 10, 15, 20].map((percent) => (
              <button
                key={percent}
                type="button"
                onClick={() => onDiscountChange(percent)}
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                  discountPercentage === percent
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                )}
              >
                {percent === 0 ? 'None' : `${percent}%`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// Icon Component
function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

export default DiscountSection;
