'use client';

/**
 * ProgressIndicator Component
 *
 * Displays the generation progress with stages and a progress bar.
 */

import type { ProgressIndicatorProps } from './types';

export function ProgressIndicator({ progress }: ProgressIndicatorProps) {
  return (
    <div className="bg-slate-700/80 rounded-2xl border border-slate-600/50 shadow-lg p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
          <span className="text-xl">🏗️</span>
        </div>
        <div>
          <h4 className="text-white font-semibold">Designing your floor plan...</h4>
          <p className="text-slate-400 text-xs">{progress.stage}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-600 rounded-full h-2.5 mb-5">
        <div
          className="bg-gradient-to-r from-amber-500 to-orange-500 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      {/* Stages */}
      <div className="space-y-3">
        {progress.stages.map((stage, index) => {
          const isActive = stage.status === 'in_progress';
          const isComplete = stage.status === 'completed';
          const isFailed = stage.status === 'failed';

          return (
            <div
              key={stage.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                isActive
                  ? 'bg-amber-500/10 border border-amber-500/30'
                  : isComplete
                  ? 'bg-emerald-500/10'
                  : isFailed
                  ? 'bg-red-500/10'
                  : 'opacity-50'
              }`}
            >
              {/* Icon */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isActive
                    ? 'bg-amber-500/20'
                    : isComplete
                    ? 'bg-emerald-500/20'
                    : isFailed
                    ? 'bg-red-500/20'
                    : 'bg-slate-600/50'
                }`}
              >
                <span className="text-base">{stage.icon}</span>
              </div>

              {/* Label */}
              <span
                className={`flex-1 text-sm font-medium ${
                  isActive
                    ? 'text-amber-300'
                    : isComplete
                    ? 'text-emerald-300'
                    : isFailed
                    ? 'text-red-300'
                    : 'text-slate-500'
                }`}
              >
                {stage.label}
              </span>

              {/* Status indicator */}
              {isActive && (
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              )}
              {isComplete && <span className="text-emerald-400 text-sm">✓</span>}
              {isFailed && <span className="text-red-400 text-sm">✗</span>}
            </div>
          );
        })}
      </div>

      {/* Estimated time */}
      <p className="text-center text-slate-500 text-xs mt-4">
        Estimated time remaining: {Math.ceil((100 - progress.percent) / 10)} seconds
      </p>
    </div>
  );
}
