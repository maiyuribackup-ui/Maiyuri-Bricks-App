"use client";

import { useCallback, useState } from "react";
import { smartQuoteTokens, cn } from "../tokens";
import type { SmartQuoteLanguage } from "@maiyuri/shared";

interface DownloadQuoteButtonProps {
  slug: string;
  language: SmartQuoteLanguage;
  /** Fires when the customer starts a download, for the staff signal feed. */
  onDownload?: () => void;
}

/**
 * "Download quotation (PDF)".
 *
 * A customer rarely decides alone — the price goes to a spouse, a contractor,
 * or a bank, and a link is a poor way to send it. This hands them a real
 * document with our number on it.
 *
 * Deliberately secondary to the page's one primary CTA: it is how the quote
 * travels, not the next step we are asking for.
 */
export function DownloadQuoteButton({
  slug,
  language,
  onDownload,
}: DownloadQuoteButtonProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { colors, typography } = smartQuoteTokens;

  const label =
    language === "ta"
      ? "விலைப்புள்ளியை PDF ஆக பதிவிறக்கவும்"
      : "Download quotation (PDF)";

  const handleClick = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    try {
      // Fetched rather than navigated so an expired or not-yet-priced quote
      // shows its reason here, instead of dumping a JSON error page on the
      // customer.
      const res = await fetch(`/api/sq/${slug}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setFailure(
          body?.error ??
            (language === "ta"
              ? "பதிவிறக்கம் தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்."
              : "The download did not start. Please try again."),
        );
        return;
      }
      const blob = await res.blob();
      // Server-supplied filename, so the saved file carries the quote number.
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named ?? "Maiyuri-Quote.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onDownload?.();
    } catch {
      setFailure(
        language === "ta"
          ? "பதிவிறக்கம் தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்."
          : "The download did not start. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [slug, language, onDownload]);

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 text-center">
      <button
        onClick={handleClick}
        disabled={busy}
        className={cn(
          "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px]",
          "border border-[#efe3d2] bg-white px-5 py-3 font-semibold",
          colors.accent.primary,
          typography.body.small,
          "shadow-sm transition hover:bg-[#fbf5ea] disabled:opacity-60",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {busy
          ? language === "ta"
            ? "தயாராகிறது…"
            : "Preparing…"
          : label}
      </button>
      <p className={cn("mt-2", typography.label.base, colors.text.muted)}>
        {language === "ta"
          ? "உங்கள் ஒப்பந்ததாரர் அல்லது குடும்பத்துடன் பகிரலாம்."
          : "Share it with your contractor, your family or your bank."}
      </p>
      {failure && (
        <p
          role="alert"
          className={cn("mt-2", typography.body.small, colors.accent.secondary)}
        >
          {failure}
        </p>
      )}
    </div>
  );
}
