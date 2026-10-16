"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { Card, Button, Badge } from "@maiyuri/ui";
import { buildWhatsAppUrl } from "@maiyuri/shared";
import type { Lead, LanguagePreference } from "@maiyuri/shared";

interface FeedbackQRCardProps {
  lead: Lead;
}

/**
 * Phase 6 — Factory-visit feedback QR / link generator.
 *
 * Renders the lead's public feedback survey URL (/feedback/<token>) as a
 * scannable QR plus copy / open / WhatsApp share actions, so a salesperson can
 * hand the customer a QR at the end of a factory visit. The token is already
 * provisioned on every lead by a DB trigger, so this card is purely
 * presentational over data on `lead` — no generation round-trip needed.
 *
 * The language toggle persists `language_preference` on the lead, which drives
 * the survey's language (EN / Tamil) when the customer opens the link.
 */
export function FeedbackQRCard({ lead }: FeedbackQRCardProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const token = lead.feedback_token ?? null;
  const language: LanguagePreference = lead.language_preference ?? "en";

  // Prefer the configured public origin; fall back to the current origin so the
  // QR still works on preview deployments and local dev.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const feedbackUrl = token ? `${baseUrl}/feedback/${token}` : null;

  const languageMutation = useMutation({
    mutationFn: async (next: LanguagePreference) => {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language_preference: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update language");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
    },
  });

  const copyLink = async () => {
    if (!feedbackUrl) return;
    await navigator.clipboard.writeText(feedbackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsAppBusiness = () => {
    if (!feedbackUrl) return;
    const message = `Hi ${lead.name ?? "there"},\n\nThank you for visiting Maiyuri Bricks! 🧱\n\nWe'd love a moment of your feedback — it takes under a minute:\n${feedbackUrl}`;
    window.open(buildWhatsAppUrl(lead.contact, message), "_blank");
  };

  const downloadPng = () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const safeName = (lead.name ?? "lead")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `maiyuri-feedback-qr-${safeName || lead.id}.png`;
    a.click();
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <QrIcon className="h-4 w-4 text-amber-500" />
          Factory Visit Feedback
        </h3>
        <Badge variant="default" className="text-xs uppercase">
          {language === "ta" ? "தமிழ்" : "EN"}
        </Badge>
      </div>

      {feedbackUrl ? (
        <div className="space-y-4">
          {/* QR code */}
          <div
            ref={canvasWrapRef}
            className="flex justify-center rounded-lg bg-white p-4"
          >
            <QRCodeCanvas
              value={feedbackUrl}
              size={176}
              level="M"
              marginSize={2}
              imageSettings={undefined}
            />
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Scan to leave feedback after the factory visit
          </p>

          {/* Link display */}
          <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              Feedback Link
            </p>
            <code className="text-xs text-slate-700 dark:text-slate-300 break-all">
              /feedback/{token}
            </code>
          </div>

          {/* Language toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Survey language:
            </span>
            <div className="inline-flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
              {(["en", "ta"] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => languageMutation.mutate(lng)}
                  disabled={languageMutation.isPending || language === lng}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    language === lng
                      ? "bg-blue-600 text-white"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {lng === "en" ? "English" : "தமிழ்"}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={copyLink}
              className="flex items-center gap-1"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3 w-3" />
                  Copied!
                </>
              ) : (
                <>
                  <CopyIcon className="h-3 w-3" />
                  Copy Link
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.open(feedbackUrl, "_blank")}
            >
              <ExternalLinkIcon className="h-3 w-3 mr-1" />
              Open
            </Button>
            <Button size="sm" variant="secondary" onClick={downloadPng}>
              <DownloadIcon className="h-3 w-3 mr-1" />
              Save QR
            </Button>
            {lead.contact && (
              <Button
                size="sm"
                variant="secondary"
                onClick={shareWhatsAppBusiness}
                className="text-green-600 hover:text-green-700"
              >
                <WhatsAppIcon className="h-3 w-3 mr-1" />
                WhatsApp Business
              </Button>
            )}
          </div>

          {languageMutation.error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {languageMutation.error.message}
            </p>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          <QrIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            No feedback link available yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Save the lead to generate one
          </p>
        </div>
      )}
    </Card>
  );
}

// Icon Components
function QrIcon({ className }: { className?: string }) {
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
        d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"
      />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
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
        d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
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
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
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
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default FeedbackQRCard;
