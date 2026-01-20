"use client";

import { useState, useCallback } from "react";
import { Card, Button, Spinner } from "@maiyuri/ui";
import { SignatureCapture } from "./SignatureCapture";
import { PhotoUpload, PhotoData } from "./PhotoUpload";
import { CheckCircle, User, FileSignature, Camera, X } from "lucide-react";

interface ProofOfDeliveryProps {
  deliveryId: string;
  deliveryName: string;
  onComplete: (data: PODData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface PODData {
  signatureDataUrl?: string;
  photos: PhotoData[];
  recipientName: string;
  notes?: string;
}

export function ProofOfDelivery({
  deliveryId,
  deliveryName,
  onComplete,
  onCancel,
  isSubmitting = false,
}: ProofOfDeliveryProps) {
  // State
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [notes, setNotes] = useState("");
  const [activeSection, setActiveSection] = useState<
    "signature" | "photos" | "details"
  >("signature");
  const [error, setError] = useState<string | null>(null);

  // Handle signature capture
  const handleSignatureCapture = useCallback((dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    setError(null);
    // Auto-advance to photos section
    setActiveSection("photos");
  }, []);

  // Handle signature clear
  const handleSignatureClear = useCallback(() => {
    setSignatureDataUrl(null);
  }, []);

  // Handle photos change
  const handlePhotosChange = useCallback((newPhotos: PhotoData[]) => {
    setPhotos(newPhotos);
    setError(null);
  }, []);

  // Validate and submit
  const handleSubmit = useCallback(async () => {
    // Validation
    if (!recipientName.trim()) {
      setError("Please enter the recipient's name");
      setActiveSection("details");
      return;
    }

    if (!signatureDataUrl) {
      setError("Please capture the recipient's signature");
      setActiveSection("signature");
      return;
    }

    try {
      await onComplete({
        signatureDataUrl,
        photos,
        recipientName: recipientName.trim(),
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to complete delivery",
      );
    }
  }, [signatureDataUrl, photos, recipientName, notes, onComplete]);

  // Check if all required fields are filled
  const isValid = signatureDataUrl && recipientName.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Proof of Delivery</h2>
            <p className="text-sm text-slate-500">{deliveryName}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress indicators */}
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setActiveSection("signature")}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeSection === "signature"
                ? "bg-blue-50 text-blue-700 border-b-2 border-blue-700"
                : signatureDataUrl
                  ? "text-green-600"
                  : "text-slate-500"
            }`}
          >
            {signatureDataUrl ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <FileSignature className="h-4 w-4" />
            )}
            Signature
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("photos")}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeSection === "photos"
                ? "bg-blue-50 text-blue-700 border-b-2 border-blue-700"
                : photos.length > 0
                  ? "text-green-600"
                  : "text-slate-500"
            }`}
          >
            {photos.length > 0 ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Photos
            {photos.length > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                {photos.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("details")}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeSection === "details"
                ? "bg-blue-50 text-blue-700 border-b-2 border-blue-700"
                : recipientName
                  ? "text-green-600"
                  : "text-slate-500"
            }`}
          >
            {recipientName ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <User className="h-4 w-4" />
            )}
            Details
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Signature Section */}
          {activeSection === "signature" && (
            <div>
              {signatureDataUrl ? (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-green-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Signature captured
                  </div>
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <img
                      src={signatureDataUrl}
                      alt="Captured signature"
                      className="w-full"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSignatureClear}
                    className="w-full"
                  >
                    Capture New Signature
                  </Button>
                </div>
              ) : (
                <SignatureCapture
                  onCapture={handleSignatureCapture}
                  onClear={handleSignatureClear}
                />
              )}
            </div>
          )}

          {/* Photos Section */}
          {activeSection === "photos" && (
            <PhotoUpload
              onPhotosChange={handlePhotosChange}
              maxPhotos={5}
              maxSizeMB={5}
            />
          )}

          {/* Details Section */}
          {activeSection === "details" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="recipientName"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Recipient Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="recipientName"
                  type="text"
                  value={recipientName}
                  onChange={(e) => {
                    setRecipientName(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter the name of the person receiving the delivery"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800"
                />
              </div>

              <div>
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Delivery Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes about the delivery..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 resize-none"
                />
              </div>

              {/* Summary */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                <h3 className="text-sm font-medium">Delivery Summary</h3>
                <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-4 w-4" />
                    <span>
                      Signature:{" "}
                      {signatureDataUrl ? (
                        <span className="text-green-600">Captured</span>
                      ) : (
                        <span className="text-amber-600">Required</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    <span>
                      Photos:{" "}
                      {photos.length > 0 ? (
                        <span className="text-green-600">
                          {photos.length} uploaded
                        </span>
                      ) : (
                        <span className="text-slate-500">Optional</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>
                      Recipient:{" "}
                      {recipientName ? (
                        <span className="text-green-600">{recipientName}</span>
                      ) : (
                        <span className="text-amber-600">Required</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                Completing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete Delivery
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
