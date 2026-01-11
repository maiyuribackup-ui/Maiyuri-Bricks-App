'use client';

/**
 * FloorPlanPreview Component
 *
 * Displays the generated floor plan with zoom/pan and action buttons.
 */

import { useState } from 'react';
import type { FloorPlanPreviewProps } from './types';

export function FloorPlanPreview({
  imageBase64,
  imageUrl,
  title,
  onViewCourtyard,
  onViewExterior,
  onDownloadDxf,
  onDownloadPng,
}: FloorPlanPreviewProps) {
  const [isZoomed, setIsZoomed] = useState(false);

  const imageSrc = imageBase64
    ? `data:image/png;base64,${imageBase64}`
    : imageUrl;

  if (!imageSrc) {
    return null;
  }

  const handleDownloadPng = () => {
    if (onDownloadPng) {
      onDownloadPng();
      return;
    }

    // Default download behavior
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = `floor-plan-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-700/80 rounded-2xl border border-slate-600/50 shadow-lg overflow-hidden">
      {/* Header */}
      {title && (
        <div className="px-4 py-3 border-b border-slate-600/50 bg-gradient-to-r from-amber-600/20 to-orange-500/20">
          <h4 className="text-white font-semibold text-sm">{title}</h4>
        </div>
      )}

      {/* Image container */}
      <div
        className={`relative overflow-hidden ${
          isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
        }`}
        onClick={() => setIsZoomed(!isZoomed)}
      >
        <img
          src={imageSrc}
          alt="Floor plan"
          className={`w-full h-auto transition-transform duration-300 ${
            isZoomed ? 'scale-150' : 'scale-100'
          }`}
        />

        {/* Zoom indicator */}
        <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg">
          {isZoomed ? 'Click to zoom out' : 'Click to zoom in'}
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 space-y-3">
        {/* View options */}
        {(onViewCourtyard || onViewExterior) && (
          <div className="flex gap-2">
            {onViewCourtyard && (
              <button
                onClick={onViewCourtyard}
                className="flex-1 py-2.5 px-4 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                <span>🌿</span>
                <span>View Courtyard</span>
              </button>
            )}
            {onViewExterior && (
              <button
                onClick={onViewExterior}
                className="flex-1 py-2.5 px-4 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                <span>🏡</span>
                <span>View Exterior</span>
              </button>
            )}
          </div>
        )}

        {/* Download options */}
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPng}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            <span>📥</span>
            <span>Download PNG</span>
          </button>
          {onDownloadDxf && (
            <button
              onClick={onDownloadDxf}
              className="flex-1 py-2.5 px-4 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              <span>📐</span>
              <span>Download DXF</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
