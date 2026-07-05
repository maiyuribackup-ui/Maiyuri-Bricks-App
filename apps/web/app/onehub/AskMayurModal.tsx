"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, Send, X } from "lucide-react";
import { onehub } from "./theme";

type AskAnswer = {
  answer: string;
  sources?: { content: string }[];
  confidence?: number;
};

async function askMayur(body: { question: string; language: "en" | "ta" }): Promise<AskAnswer> {
  const res = await fetch("/api/knowledge/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, maxSources: 4 }),
  });
  if (!res.ok) throw new Error("Mayur could not answer right now. Please try again.");
  return (await res.json()).data;
}

type Turn = { q: string; a: string; sources: number };

const SUGGESTIONS = [
  "How do I handle a new lead?",
  "What should I do during a factory visit?",
  "இன்று உற்பத்தி திட்டம் எப்படி செய்வது?",
];

export function AskMayurModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState<"en" | "ta">("en");
  const [history, setHistory] = useState<Turn[]>([]);

  const ask = useMutation({
    mutationFn: askMayur,
    onSuccess: (data, vars) => {
      setHistory((h) => [
        { q: vars.question, a: data.answer, sources: data.sources?.length ?? 0 },
        ...h,
      ]);
      setQuestion("");
    },
  });

  const submit = () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    ask.mutate({ question: q, language });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ background: `linear-gradient(135deg, ${onehub.brandTop}, ${onehub.brandDark})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/onehub/mayur-avatar.png"
            alt="Mayur"
            className="h-10 w-10 rounded-full bg-white/15 object-cover object-top"
          />
          <div className="flex-1">
            <p className="font-semibold text-white">Ask Mayur</p>
            <p className="text-xs text-white/70">
              Answers from Maiyuri&apos;s own SOPs &amp; knowledge
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: onehub.canvas }}>
          {history.length === 0 && !ask.isPending ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: onehub.textMuted }}>
                Try asking
              </p>
              <div className="space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setQuestion(s)}
                    className="flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-left text-sm hover:border-[color:var(--oh-accent)]"
                    style={{ borderColor: onehub.cardBorder, color: onehub.text, ["--oh-accent" as string]: onehub.accent }}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" style={{ color: onehub.accent }} />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {ask.isPending ? (
            <div className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3" style={{ borderColor: onehub.cardBorder }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/onehub/mayur-thinking.png" alt="" className="h-10 w-10 animate-pulse object-contain" />
              <span className="text-sm" style={{ color: onehub.textMuted }}>Mayur is thinking…</span>
            </div>
          ) : null}

          {ask.isError ? (
            <p className="mt-2 text-sm" style={{ color: onehub.high.fg }}>
              {ask.error instanceof Error ? ask.error.message : "Something went wrong."}
            </p>
          ) : null}

          <div className="mt-3 space-y-4">
            {history.map((t, i) => (
              <div key={i}>
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-sm text-white" style={{ background: onehub.brand }}>
                  {t.q}
                </div>
                <div className="mt-2 w-fit max-w-[90%] rounded-2xl rounded-tl-sm border bg-white px-4 py-3 text-sm" style={{ borderColor: onehub.cardBorder, color: onehub.text }}>
                  <p className="whitespace-pre-wrap leading-6">{t.a}</p>
                  <p className="mt-2 text-xs" style={{ color: onehub.textMuted }}>
                    🦚 {t.sources} source{t.sources === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* composer */}
        <div className="border-t px-4 py-3" style={{ borderColor: onehub.cardBorder }}>
          <div className="mb-2 flex gap-2">
            {(["en", "ta"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={
                  language === l
                    ? { background: onehub.brand, color: "#fff" }
                    : { background: "#f1e9dd", color: onehub.textMuted }
                }
              >
                {l === "en" ? "English" : "தமிழ்"}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={language === "ta" ? "உங்கள் கேள்வியை கேளுங்கள்…" : "Ask Mayur anything…"}
              className="max-h-28 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={{ borderColor: onehub.cardBorder, color: onehub.text }}
            />
            <button
              onClick={submit}
              disabled={ask.isPending || !question.trim()}
              aria-label="Send"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40"
              style={{ background: onehub.accent }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
