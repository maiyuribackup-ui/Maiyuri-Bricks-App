"use client";

import { useRef, useState, useCallback } from "react";
import { Button } from "@maiyuri/ui";
import { Camera, Upload, X, ImagePlus, Trash2 } from "lucide-react";

interface PhotoUploadProps {
  onPhotosChange: (photos: PhotoData[]) => void;
  maxPhotos?: number;
  maxSizeMB?: number;
}

export interface PhotoData {
  id: string;
  file: File;
  preview: string;
}

export function PhotoUpload({
  onPhotosChange,
  maxPhotos = 5,
  maxSizeMB = 5,
}: PhotoUploadProps) {
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Generate unique ID
  const generateId = () =>
    `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Validate and process file
  const processFile = useCallback(
    (file: File): PhotoData | null => {
      // Check file type
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return null;
      }

      // Check file size
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > maxSizeMB) {
        setError(`Image size must be less than ${maxSizeMB}MB`);
        return null;
      }

      // Create preview URL
      const preview = URL.createObjectURL(file);

      return {
        id: generateId(),
        file,
        preview,
      };
    },
    [maxSizeMB],
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const newPhotos: PhotoData[] = [];
      const remainingSlots = maxPhotos - photos.length;

      for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
        const photoData = processFile(files[i]);
        if (photoData) {
          newPhotos.push(photoData);
        }
      }

      if (files.length > remainingSlots) {
        setError(`Maximum ${maxPhotos} photos allowed`);
      }

      if (newPhotos.length > 0) {
        const updatedPhotos = [...photos, ...newPhotos];
        setPhotos(updatedPhotos);
        onPhotosChange(updatedPhotos);
      }

      // Reset input
      event.target.value = "";
    },
    [photos, maxPhotos, processFile, onPhotosChange],
  );

  // Remove a photo
  const handleRemove = useCallback(
    (id: string) => {
      const photoToRemove = photos.find((p) => p.id === id);
      if (photoToRemove) {
        URL.revokeObjectURL(photoToRemove.preview);
      }

      const updatedPhotos = photos.filter((p) => p.id !== id);
      setPhotos(updatedPhotos);
      onPhotosChange(updatedPhotos);
      setError(null);
    },
    [photos, onPhotosChange],
  );

  // Clear all photos
  const handleClearAll = useCallback(() => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    onPhotosChange([]);
    setError(null);
  }, [photos, onPhotosChange]);

  // Trigger file input
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Trigger camera input
  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const canAddMore = photos.length < maxPhotos;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Delivery Photos ({photos.length}/{maxPhotos})
        </div>
        {photos.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group"
            >
              <img
                src={photo.preview}
                alt="Delivery photo"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemove(photo.id)}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* Add more placeholder */}
          {canAddMore && (
            <button
              type="button"
              onClick={handleUploadClick}
              className="aspect-square rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ImagePlus className="h-6 w-6 text-slate-400" />
              <span className="text-xs text-slate-500">Add</span>
            </button>
          )}
        </div>
      )}

      {/* Upload buttons (show when no photos or can add more) */}
      {photos.length === 0 && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCameraClick}
            className="flex-1"
            disabled={!canAddMore}
          >
            <Camera className="h-4 w-4 mr-2" />
            Take Photo
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleUploadClick}
            className="flex-1"
            disabled={!canAddMore}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>
      )}

      {/* Quick action buttons when photos exist */}
      {photos.length > 0 && canAddMore && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCameraClick}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-1" />
            Camera
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleUploadClick}
            className="flex-1"
          >
            <Upload className="h-4 w-4 mr-1" />
            Gallery
          </Button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Instructions */}
      <p className="text-xs text-slate-500 text-center">
        Take photos of the delivered goods for proof of delivery
      </p>
    </div>
  );
}
