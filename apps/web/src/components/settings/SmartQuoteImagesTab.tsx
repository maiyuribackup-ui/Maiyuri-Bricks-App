"use client";

import { useState, useCallback, useRef } from "react";
import { Card, Button, Spinner } from "@maiyuri/ui";
import {
  useTemplateImages,
  useUploadImage,
  useDeleteImage,
} from "@/hooks/useSmartQuoteImages";
import type { SmartQuoteImage, SmartQuotePageKey } from "@maiyuri/shared";

const PAGE_KEYS: Array<{
  key: SmartQuotePageKey;
  label: string;
  description: string;
}> = [
  { key: "entry", label: "Entry Hero", description: "Landing section image" },
  { key: "climate", label: "Climate", description: "Chennai logic section" },
  { key: "cost", label: "Cost", description: "Pricing section" },
  { key: "objection", label: "Objection", description: "Address concerns" },
  { key: "cta", label: "CTA", description: "Call to action" },
];

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_SIZE_MB = 10;

export function SmartQuoteImagesTab() {
  const { data: images, isLoading, error: fetchError } = useTemplateImages();
  const uploadMutation = useUploadImage();
  const deleteMutation = useDeleteImage();

  const [dragOver, setDragOver] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Get image for a specific page key
  const getImageForKey = useCallback(
    (pageKey: SmartQuotePageKey): SmartQuoteImage | undefined => {
      return images?.find((img) => img.page_key === pageKey);
    },
    [images],
  );

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `Invalid file type. Allowed: JPEG, PNG, WebP, AVIF`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File too large. Maximum size is ${MAX_SIZE_MB}MB`;
    }
    return null;
  }, []);

  // Handle file upload
  const handleUpload = useCallback(
    async (file: File, pageKey: SmartQuotePageKey) => {
      setUploadError(null);

      const validationError = validateFile(file);
      if (validationError) {
        setUploadError(validationError);
        return;
      }

      try {
        await uploadMutation.mutateAsync({ file, pageKey });
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Failed to upload image",
        );
      }
    },
    [uploadMutation, validateFile],
  );

  // Handle delete
  const handleDelete = useCallback(
    async (imageId: string) => {
      if (!confirm("Are you sure you want to delete this image?")) {
        return;
      }

      try {
        await deleteMutation.mutateAsync({ imageId });
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Failed to delete image",
        );
      }
    },
    [deleteMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="text-center py-12 text-red-600">
        Failed to load images. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Smart Quote Images
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload hero images for each section of the Smart Quote pages. These
          template images apply to all quotes.
        </p>
      </div>

      {/* Error message */}
      {uploadError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-700 dark:text-red-400">
            {uploadError}
          </p>
          <button
            onClick={() => setUploadError(null)}
            className="mt-2 text-xs text-red-600 dark:text-red-500 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Image Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {PAGE_KEYS.map(({ key, label, description }) => (
          <ImageCard
            key={key}
            pageKey={key}
            label={label}
            description={description}
            image={getImageForKey(key)}
            isUploading={
              uploadMutation.isPending &&
              uploadMutation.variables?.pageKey === key
            }
            isDeleting={deleteMutation.isPending}
            dragOver={dragOver === key}
            onDragOver={() => setDragOver(key)}
            onDragLeave={() => setDragOver(null)}
            onUpload={(file) => handleUpload(file, key)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Help text */}
      <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <p>
          Supported formats: JPEG, PNG, WebP, AVIF. Maximum size: {MAX_SIZE_MB}
          MB.
        </p>
        <p>Recommended aspect ratio: 16:9 (1920x1080 or similar).</p>
      </div>
    </div>
  );
}

interface ImageCardProps {
  pageKey: SmartQuotePageKey;
  label: string;
  description: string;
  image?: SmartQuoteImage;
  isUploading: boolean;
  isDeleting: boolean;
  dragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onUpload: (file: File) => void;
  onDelete: (imageId: string) => void;
}

function ImageCard({
  pageKey,
  label,
  description,
  image,
  isUploading,
  isDeleting,
  dragOver,
  onDragOver,
  onDragLeave,
  onUpload,
  onDelete,
}: ImageCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDragLeave();

      const file = e.dataTransfer.files[0];
      if (file) {
        onUpload(file);
      }
    },
    [onDragLeave, onUpload],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDragOver();
    },
    [onDragOver],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onUpload(file);
      }
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onUpload],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <Card className="overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Image area */}
      <div
        className={`relative aspect-video bg-slate-100 dark:bg-slate-800 transition-all ${
          dragOver ? "ring-2 ring-blue-500 ring-inset" : "ring-0"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeave}
        onMouseEnter={() => setShowOverlay(true)}
        onMouseLeave={() => setShowOverlay(false)}
      >
        {image ? (
          <>
            {/* Image */}
            <img
              src={image.image_url}
              alt={label}
              className="w-full h-full object-cover"
            />

            {/* Hover overlay */}
            {(showOverlay || isUploading || isDeleting) && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 transition-opacity">
                {isUploading ? (
                  <Spinner size="md" />
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleClick}
                      disabled={isDeleting}
                    >
                      Replace
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onDelete(image.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "..." : "Delete"}
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          // Empty state
          <button
            onClick={handleClick}
            disabled={isUploading}
            className={`w-full h-full flex flex-col items-center justify-center gap-2 border-2 border-dashed transition-colors ${
              dragOver
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500"
            }`}
          >
            {isUploading ? (
              <Spinner size="md" />
            ) : (
              <>
                <UploadIcon className="w-8 h-8 text-slate-400" />
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Click or drag to upload
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Label */}
      <div className="p-3">
        <h3 className="font-medium text-slate-900 dark:text-white">{label}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
    </Card>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  );
}
