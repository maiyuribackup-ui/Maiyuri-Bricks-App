'use client';

/**
 * ImageUploader Component
 *
 * Handles survey document upload with drag-and-drop and preview.
 */

import { useState, useRef, useCallback } from 'react';
import type { ImageUploaderProps } from './types';

export function ImageUploader({
  onUpload,
  onCancel,
  accept = 'image/png,image/jpeg,image/webp,application/pdf',
  maxSizeMB = 10,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      // Validate file type
      const validTypes = accept.split(',').map((t) => t.trim());
      if (!validTypes.some((type) => file.type === type || file.type.startsWith(type.split('/')[0]))) {
        setError('Please upload an image (PNG, JPEG) or PDF file.');
        return;
      }

      // Validate file size
      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        setError(`File too large. Maximum size is ${maxSizeMB}MB.`);
        return;
      }

      setIsLoading(true);

      try {
        // Read file as base64
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          // Remove data URL prefix
          const base64Data = base64.split(',')[1];

          // For images, show preview
          if (file.type.startsWith('image/')) {
            setPreview(base64);
          }

          onUpload(base64Data);
          setIsLoading(false);
        };
        reader.onerror = () => {
          setError('Failed to read file. Please try again.');
          setIsLoading(false);
        };
        reader.readAsDataURL(file);
      } catch (e) {
        setError('Failed to process file. Please try again.');
        setIsLoading(false);
      }
    },
    [accept, maxSizeMB, onUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div className="bg-slate-700/80 rounded-2xl border border-slate-600/50 shadow-lg p-5">
      {/* Upload area */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${
            isDragging
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-slate-500 hover:border-amber-500/50 hover:bg-slate-600/30'
          }
          ${isLoading ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            <p className="text-slate-300 text-sm">Processing file...</p>
          </div>
        ) : preview ? (
          <div className="space-y-3">
            <img
              src={preview}
              alt="Survey preview"
              className="max-h-48 mx-auto rounded-lg"
            />
            <p className="text-emerald-400 text-sm">✓ File uploaded successfully</p>
          </div>
        ) : (
          <>
            {/* Upload icon */}
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">📄</span>
            </div>

            <p className="text-white font-medium mb-1">
              {isDragging ? 'Drop your file here' : 'Upload your land survey'}
            </p>
            <p className="text-slate-400 text-sm">
              Drag and drop or click to browse
            </p>
            <p className="text-slate-500 text-xs mt-2">
              Supports PNG, JPEG, PDF • Max {maxSizeMB}MB
            </p>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-sm font-medium transition-all"
        >
          Cancel
        </button>
        {preview && (
          <button
            onClick={() => {
              setPreview(null);
              setError(null);
            }}
            className="flex-1 py-2.5 px-4 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-sm font-medium transition-all"
          >
            Upload Different File
          </button>
        )}
      </div>
    </div>
  );
}
