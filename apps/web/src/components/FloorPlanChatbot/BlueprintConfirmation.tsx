'use client';

/**
 * BlueprintConfirmation Component
 *
 * Displays the generated blueprint for user review and confirmation
 * before proceeding to generate the 3D isometric view.
 */

import { useState } from 'react';
import type { BlueprintConfirmationProps } from './types';

export function BlueprintConfirmation({
  blueprintImage,
  mimeType = 'image/png',
  designSummary,
  onConfirm,
  onReject,
  isLoading = false,
}: BlueprintConfirmationProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isZoomed, setIsZoomed] = useState(false);

  const handleReject = () => {
    if (showFeedback && feedback.trim()) {
      onReject(feedback.trim());
    } else {
      setShowFeedback(true);
    }
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <div className="bg-slate-800/90 rounded-2xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-emerald-600/20 to-teal-500/20 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <span className="text-xl">📋</span>
          </div>
          <div>
            <h3 className="font-semibold text-white">Blueprint Ready for Review</h3>
            <p className="text-slate-400 text-sm">
              Please review your floor plan before generating the 3D view
            </p>
          </div>
        </div>
      </div>

      {/* Blueprint Image */}
      <div className="p-4">
        <div
          className={`relative bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 ${
            isZoomed ? 'fixed inset-4 z-50' : ''
          }`}
          onClick={() => setIsZoomed(!isZoomed)}
        >
          {isZoomed && (
            <div
              className="absolute inset-0 bg-black/80 -z-10"
              onClick={(e) => {
                e.stopPropagation();
                setIsZoomed(false);
              }}
            />
          )}
          <img
            src={`data:${mimeType};base64,${blueprintImage}`}
            alt="Generated Blueprint"
            className={`w-full h-auto ${isZoomed ? 'max-h-[90vh] object-contain' : ''}`}
          />
          {!isZoomed && (
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              Click to zoom
            </div>
          )}
        </div>
      </div>

      {/* Design Summary */}
      <div className="px-5 py-4 border-t border-slate-700/50">
        <h4 className="text-sm font-medium text-slate-300 mb-3">Design Summary</h4>
        <div className="grid grid-cols-2 gap-3">
          {designSummary.plotSize && (
            <div className="bg-slate-700/50 rounded-lg px-3 py-2">
              <span className="text-slate-400 text-xs">Plot Size</span>
              <p className="text-white font-medium">{designSummary.plotSize}</p>
            </div>
          )}
          {designSummary.roomCount !== undefined && (
            <div className="bg-slate-700/50 rounded-lg px-3 py-2">
              <span className="text-slate-400 text-xs">Total Rooms</span>
              <p className="text-white font-medium">{designSummary.roomCount}</p>
            </div>
          )}
          {designSummary.vastuCompliant !== undefined && (
            <div className="bg-slate-700/50 rounded-lg px-3 py-2">
              <span className="text-slate-400 text-xs">Vastu Compliance</span>
              <p className={`font-medium ${designSummary.vastuCompliant ? 'text-emerald-400' : 'text-amber-400'}`}>
                {designSummary.vastuCompliant ? 'Compliant' : 'Minor deviations'}
              </p>
            </div>
          )}
          {(designSummary.hasCourtyard || designSummary.hasVerandah) && (
            <div className="bg-slate-700/50 rounded-lg px-3 py-2">
              <span className="text-slate-400 text-xs">Features</span>
              <p className="text-white font-medium text-sm">
                {[
                  designSummary.hasCourtyard && 'Courtyard',
                  designSummary.hasVerandah && 'Verandah',
                ].filter(Boolean).join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Room List */}
        {designSummary.rooms && designSummary.rooms.length > 0 && (
          <div className="mt-4">
            <h5 className="text-xs font-medium text-slate-400 mb-2">Room Details</h5>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {designSummary.rooms.map((room, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm bg-slate-700/30 rounded px-3 py-1.5"
                >
                  <span className="text-slate-300">{room.name}</span>
                  <span className="text-slate-400">{room.areaSqft} sq.ft</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Feedback Input (shown when rejecting) */}
      {showFeedback && (
        <div className="px-5 py-4 border-t border-slate-700/50 bg-slate-800/50">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            What changes would you like to make?
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g., Make the living room bigger, move kitchen to the south..."
            className="w-full px-4 py-3 bg-slate-900/70 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all text-sm resize-none"
            rows={3}
            disabled={isLoading}
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                setShowFeedback(false);
                setFeedback('');
              }}
              className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={() => onReject(feedback.trim() || undefined)}
              className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Submitting...' : 'Submit Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!showFeedback && (
        <div className="px-5 py-4 border-t border-slate-700/50 flex gap-3">
          <button
            onClick={handleReject}
            className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Make Changes
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg hover:shadow-emerald-500/30 flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Looks Good! Generate 3D View
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
