"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Badge, Spinner } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import type { Lead, SmartQuote } from "@maiyuri/shared";

interface SmartQuoteCardProps {
  lead: Lead;
  hasTranscripts: boolean;
}

async function generateSmartQuote(
  leadId: string,
): Promise<{ data: SmartQuote }> {
  const res = await fetch("/api/smart-quotes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error ?? "Failed to generate Smart Quote");
  }
  return res.json();
}

async function fetchExistingQuote(leadId: string): Promise<SmartQuote | null> {
  const res = await fetch(`/api/smart-quotes?lead_id=${leadId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0] ?? null;
}

export function SmartQuoteCard({ lead, hasTranscripts }: SmartQuoteCardProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  // Fetch existing quote for this lead
  const { data: existingQuote, isLoading } = useQuery({
    queryKey: ["smart-quote", lead.id],
    queryFn: async () => {
      // Check if lead already has a smart quote by searching for it
      const res = await fetch(`/api/smart-quotes/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, regenerate: false }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.data as SmartQuote;
    },
    enabled: false, // Don't auto-fetch, we'll use the mutation
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateSmartQuote(lead.id),
    onSuccess: (data) => {
      queryClient.setQueryData(["smart-quote", lead.id], data.data);
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/smart-quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, regenerate: true }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error ?? "Failed to regenerate");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["smart-quote", lead.id], data.data);
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
    },
  });

  const quote = existingQuote ?? generateMutation.data?.data;
  const isGenerating = generateMutation.isPending;
  const isRegenerating = regenerateMutation.isPending;

  const quoteUrl = quote
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sq/${quote.link_slug}`
    : null;

  const copyLink = async () => {
    if (!quoteUrl) return;
    await navigator.clipboard.writeText(quoteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    if (!quoteUrl) return;
    const text = encodeURIComponent(
      `Hi ${lead.name ?? "there"},\n\nHere's your personalized quote from Maiyuri Bricks:\n${quoteUrl}\n\nTake a look and let us know if you have any questions!`,
    );
    window.open(`https://wa.me/${lead.contact}?text=${text}`, "_blank");
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <DocumentIcon className="h-4 w-4 text-amber-500" />
          Smart Quote
        </h3>
        {quote && (
          <Badge variant="success" className="text-xs">
            Generated
          </Badge>
        )}
      </div>

      {quote ? (
        // Quote exists - show link and actions
        <div className="space-y-4">
          {/* Quote Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Stage:
              </span>
              <Badge
                variant={
                  quote.stage === "hot"
                    ? "danger"
                    : quote.stage === "warm"
                      ? "warning"
                      : "default"
                }
              >
                {quote.stage ?? "cold"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Route:
              </span>
              <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">
                {(quote.route_decision ?? "nurture").replace(/_/g, " ")}
              </span>
            </div>
            {quote.persona && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Persona:
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300 capitalize">
                  {quote.persona}
                </span>
              </div>
            )}
          </div>

          {/* Link display */}
          <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
              Quote Link
            </p>
            <code className="text-xs text-slate-700 dark:text-slate-300 break-all">
              /sq/{quote.link_slug}
            </code>
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
              onClick={() => window.open(quoteUrl!, "_blank")}
            >
              <ExternalLinkIcon className="h-3 w-3 mr-1" />
              Open
            </Button>
            {lead.contact && (
              <Button
                size="sm"
                variant="secondary"
                onClick={shareWhatsApp}
                className="text-green-600 hover:text-green-700"
              >
                <WhatsAppIcon className="h-3 w-3 mr-1" />
                WhatsApp
              </Button>
            )}
          </div>

          {/* Regenerate option */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => regenerateMutation.mutate()}
              disabled={isRegenerating}
              className="text-slate-500 hover:text-slate-700"
            >
              {isRegenerating ? (
                <>
                  <Spinner size="sm" className="mr-1" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshIcon className="h-3 w-3 mr-1" />
                  Regenerate
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        // No quote - show generate button
        <div className="text-center py-4">
          <DocumentIcon className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Generate a personalized Smart Quote
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            AI-powered, bilingual (EN/Tamil)
          </p>

          {hasTranscripts ? (
            <Button
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={isGenerating}
              className="mt-4"
            >
              {isGenerating ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Generating...
                </>
              ) : (
                "Generate Smart Quote"
              )}
            </Button>
          ) : (
            <div className="mt-4">
              <Button size="sm" disabled className="opacity-50">
                Generate Smart Quote
              </Button>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Upload call recordings first
              </p>
            </div>
          )}

          {generateMutation.error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              {generateMutation.error.message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// Icon Components
function DocumentIcon({ className }: { className?: string }) {
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
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
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

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
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
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

export default SmartQuoteCard;
