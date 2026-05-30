"use client";

/**
 * VoiceFeedbackClient — the "Talk to Maiyuri" live voice conversation (Phase 5).
 *
 * Lifecycle:
 *   consent -> connecting -> live -> review -> submitting -> done
 *                                   \-> error (with tap-form fallback)
 *
 * 1. Mints a scoped Gemini Live ephemeral token from the Phase-4 endpoint.
 * 2. Opens a Live session (the SDK is dynamic-imported so it stays out of the
 *    initial page bundle), streams 16 kHz mic PCM up and plays 24 kHz model
 *    PCM back.
 * 3. When the model calls `submit_feedback`, we DON'T auto-write — we show the
 *    captured fields as an editable confirmation grid (the reliability layer),
 *    let the visitor fix anything, then POST to the same /submit endpoint the
 *    tap form uses (channel: "voice").
 * 4. Falls back to the tap form on mic-denied / connection failure / 20 s of
 *    silence.
 *
 * Loaded via next/dynamic({ ssr: false }) — never server-rendered.
 *
 * See: docs/plans/2026-05-28-voice-feedback-plan.md (Phase 5)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveServerMessage, Session } from "@google/genai";
import styles from "./voice-feedback.module.css";
import { MicCapture, PcmPlayer, base64ToInt16 } from "@/lib/feedback/voice-audio";
import type { LeadContext } from "./factory-feedback-survey";

type Phase =
  | "consent"
  | "connecting"
  | "live"
  | "review"
  | "submitting"
  | "done"
  | "error";

type Captured = {
  name: string;
  mobile: string;
  build_type: string;
  rating: number | null;
  impressed: string[];
  clarity: string;
  benefits: string[];
  concerns: string[];
  timeline: string;
  next_action: string;
  next_action_notes: string;
  priority_followup: boolean;
  followup_reason: string;
};

const EMPTY: Captured = {
  name: "",
  mobile: "",
  build_type: "",
  rating: null,
  impressed: [],
  clarity: "",
  benefits: [],
  concerns: [],
  timeline: "",
  next_action: "",
  next_action_notes: "",
  priority_followup: false,
  followup_reason: "",
};

const NEXT_LABELS: Record<string, string> = {
  quote: "Personalised quote",
  floor_plan: "Floor-plan review",
  advisor: "Advisor call",
  architect: "Discuss with architect",
  visit_project: "Visit a project",
  reports: "Test reports & details",
  sample: "Sample / Mudhal Sengal",
  later: "Follow up later",
  exploring: "Just exploring",
};

const SILENCE_FALLBACK_MS = 20000;
// Hard cap on the connect phase. If token-mint + Live socket + mic don't all
// come up within this window, we bail to the tap form instead of hanging on
// "Connecting…" (the iOS failure mode when the AudioContext won't unlock).
const CONNECT_TIMEOUT_MS = 15000;

function toStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function toStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

export function VoiceFeedbackClient({
  token,
  context,
  onClose,
  onSubmitted,
  onFallback,
}: {
  token: string;
  context: LeadContext;
  onClose: () => void;
  onSubmitted: () => void;
  onFallback: () => void;
}) {
  const { lead } = context;
  const [phase, setPhase] = useState<Phase>("consent");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [captured, setCaptured] = useState<Captured>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const transcriptRef = useRef<string>("");
  const startedAtRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const teardownRef = useRef<() => void>(() => {});

  const teardown = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (speakIntervalRef.current) clearInterval(speakIntervalRef.current);
    silenceTimerRef.current = null;
    speakIntervalRef.current = null;
    try {
      micRef.current?.stop();
    } catch {
      /* noop */
    }
    try {
      playerRef.current?.close();
    } catch {
      /* noop */
    }
    try {
      sessionRef.current?.close();
    } catch {
      /* noop */
    }
    micRef.current = null;
    playerRef.current = null;
    sessionRef.current = null;
  }, []);
  teardownRef.current = teardown;

  // Clean up on unmount.
  useEffect(() => () => teardownRef.current(), []);

  const failToFallback = useCallback(
    (msg: string) => {
      teardown();
      setError(msg);
      setPhase("error");
    },
    [teardown],
  );

  const captureFromArgs = useCallback((args: Record<string, unknown>) => {
    const ratingRaw = args.rating;
    const rating =
      typeof ratingRaw === "number"
        ? Math.round(ratingRaw)
        : typeof ratingRaw === "string" && ratingRaw.trim()
          ? Math.round(Number(ratingRaw)) || null
          : null;
    setCaptured({
      name: toStr(args.name) || lead.name,
      mobile: toStr(args.mobile).replace(/\D/g, "").slice(-10),
      build_type: toStr(args.build_type),
      rating,
      impressed: toStrArr(args.impressed),
      clarity: toStr(args.clarity),
      benefits: toStrArr(args.benefits),
      concerns: toStrArr(args.concerns),
      timeline: toStr(args.timeline),
      next_action: toStr(args.next_action),
      next_action_notes: toStr(args.next_action_notes),
      priority_followup: args.priority_followup === true,
      followup_reason: toStr(args.followup_reason),
    });
  }, [lead.name]);

  const handleMessage = useCallback(
    (msg: LiveServerMessage) => {
      const sc = msg.serverContent;
      if (sc?.interrupted) playerRef.current?.flush();

      // Stream model audio out.
      const parts = sc?.modelTurn?.parts ?? [];
      for (const p of parts) {
        const inline = p.inlineData;
        if (inline?.data && inline.mimeType?.startsWith("audio/")) {
          playerRef.current?.push(base64ToInt16(inline.data));
        }
      }

      // Visitor speech transcript — also clears the silence-fallback timer.
      const inText = sc?.inputTranscription?.text;
      if (inText) {
        transcriptRef.current += inText;
        setHeard(transcriptRef.current.slice(-160));
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      }

      // The single tool call → go to human-confirm review.
      const calls = msg.toolCall?.functionCalls;
      if (calls && calls.length) {
        for (const fc of calls) {
          if (fc.name === "submit_feedback") {
            captureFromArgs((fc.args ?? {}) as Record<string, unknown>);
            try {
              sessionRef.current?.sendToolResponse({
                functionResponses: [
                  {
                    id: fc.id,
                    name: fc.name,
                    response: {
                      result:
                        "Recorded. Thank the visitor warmly by name and end the conversation.",
                    },
                  },
                ],
              });
            } catch {
              /* session may already be closing */
            }
          }
        }
        // Stop capturing; let any goodbye audio finish playing.
        try {
          micRef.current?.stop();
        } catch {
          /* noop */
        }
        micRef.current = null;
        setPhase("review");
      }
    },
    [captureFromArgs],
  );

  const start = useCallback(async () => {
    setError("");
    setPhase("connecting");

    // iOS CRITICAL: create + unlock the OUTPUT AudioContext synchronously here,
    // inside the gesture, BEFORE any `await`. WebKit (every iOS browser) only
    // unlocks audio if resume() runs while the page still has transient
    // activation; doing it after an await leaves the context suspended and the
    // call hangs on "Connecting…". See PcmPlayer.unlock.
    let player: PcmPlayer;
    try {
      player = new PcmPlayer();
      player.unlock();
      playerRef.current = player;
    } catch {
      failToFallback("Could not start audio. Please use the tap form.");
      return;
    }

    // Never strand the user on "Connecting…": if the whole connect dance doesn't
    // finish in time, bail to the tap form. `aborted` stops the in-flight async
    // chain from racing back to "live" after we've already given up.
    let aborted = false;
    const connectTimer = setTimeout(() => {
      aborted = true;
      failToFallback("Voice took too long to connect. Please use the tap form.");
    }, CONNECT_TIMEOUT_MS);

    try {
      // 1) Mint the scoped ephemeral token.
      const res = await fetch(`/api/feedback/${token}/voice-token`, {
        method: "POST",
      });
      if (aborted) return;
      const json = await res.json();
      if (aborted) return;
      if (!res.ok || !json?.data?.token) {
        clearTimeout(connectTimer);
        failToFallback("Could not start voice. Please use the tap form.");
        return;
      }
      const ephToken: string = json.data.token;
      const model: string = json.data.model;

      // Ensure the already-unlocked context is fully running before playback.
      await player.resume();
      if (aborted) return;

      // 2) Open the Live session (SDK dynamic-imported).
      const { GoogleGenAI, Modality } = await import("@google/genai");
      if (aborted) return;
      const ai = new GoogleGenAI({
        apiKey: ephToken,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const session = await ai.live.connect({
        model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onopen: () => {
            /* setup sent by SDK */
          },
          onmessage: handleMessage,
          onerror: () => {
            failToFallback("Voice connection error. Please use the tap form.");
          },
          onclose: () => {
            // A close during connect/live (before a tool call) is a failure;
            // a close after the review hand-off is the normal teardown.
            setPhase((p) => {
              if (p === "live" || p === "connecting") {
                setError("The voice connection closed. Please use the tap form.");
                return "error";
              }
              return p;
            });
          },
        },
      });
      if (aborted) {
        try {
          session.close();
        } catch {
          /* noop */
        }
        return;
      }
      sessionRef.current = session;

      // 3) Start the mic and pump PCM up.
      const mic = new MicCapture((b64) => {
        try {
          sessionRef.current?.sendRealtimeInput({
            audio: { data: b64, mimeType: "audio/pcm;rate=16000" },
          });
        } catch {
          /* session closing */
        }
      });
      try {
        await mic.start();
      } catch {
        clearTimeout(connectTimer);
        failToFallback("We couldn't access your microphone. Please use the tap form.");
        return;
      }
      if (aborted) {
        try {
          mic.stop();
        } catch {
          /* noop */
        }
        return;
      }
      micRef.current = mic;

      clearTimeout(connectTimer);
      startedAtRef.current = Date.now();
      setPhase("live");

      // Speaking indicator polls the playback timeline.
      speakIntervalRef.current = setInterval(() => {
        setSpeaking(!!playerRef.current?.isPlaying);
      }, 150);

      // Silence fallback: no visitor transcript within 20 s → tap form.
      silenceTimerRef.current = setTimeout(() => {
        failToFallback("We didn't catch any audio. Please use the tap form.");
      }, SILENCE_FALLBACK_MS);
    } catch {
      clearTimeout(connectTimer);
      if (!aborted) failToFallback("Could not start voice. Please use the tap form.");
    }
  }, [token, handleMessage, failToFallback]);

  const endConversation = useCallback(() => {
    // Ask the model to wrap up by sending a final text nudge, then stop the mic
    // and surface whatever was captured so far for confirmation.
    try {
      sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      /* noop */
    }
    try {
      micRef.current?.stop();
    } catch {
      /* noop */
    }
    micRef.current = null;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setPhase("review");
  }, []);

  const submit = useCallback(async () => {
    if (!captured.mobile || captured.mobile.length !== 10) {
      setError("Please add a valid 10-digit WhatsApp number before sending.");
      return;
    }
    if (!captured.rating) {
      setError("Please set a visit rating (1–5) before sending.");
      return;
    }
    if (!captured.next_action) {
      setError("Please pick what you'd like next before sending.");
      return;
    }
    setError("");
    setPhase("submitting");

    const duration_sec = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : null;

    const payload = {
      channel: "voice" as const,
      language: lead.language_preference,
      visitor: {
        name: captured.name.trim() || lead.name,
        mobile: captured.mobile,
        build_type: captured.build_type || null,
      },
      visit: {
        rating: captured.rating,
        impressed: captured.impressed,
        clarity: captured.clarity || null,
      },
      product: {
        benefits: captured.benefits,
        concerns: captured.concerns,
        timeline: captured.timeline || null,
      },
      next_step: {
        action: captured.next_action,
        detail: {},
        notes: captured.next_action_notes || null,
      },
      flags: captured.priority_followup
        ? {
            priority_followup: true,
            followup_reason: captured.followup_reason || undefined,
          }
        : {},
      voice: {
        transcript: transcriptRef.current.slice(0, 20000) || null,
        duration_sec,
      },
    };

    try {
      const res = await fetch(`/api/feedback/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Could not submit. Please try again.");
        setPhase("review");
        return;
      }
      teardown();
      setPhase("done");
      onSubmitted();
    } catch {
      setError("Network problem. Please try again.");
      setPhase("review");
    }
  }, [captured, lead, token, teardown, onSubmitted]);

  // ---- Field-grid editing helpers ----
  const setField = (key: keyof Captured, value: string) => {
    setCaptured((c) => {
      if (key === "rating") {
        const n = Math.round(Number(value));
        return { ...c, rating: Number.isFinite(n) && n >= 1 && n <= 5 ? n : null };
      }
      if (key === "mobile") return { ...c, mobile: value.replace(/\D/g, "").slice(0, 10) };
      if (
        key === "impressed" ||
        key === "benefits" ||
        key === "concerns"
      ) {
        return {
          ...c,
          [key]: value.split(",").map((s) => s.trim()).filter(Boolean),
        };
      }
      return { ...c, [key]: value } as Captured;
    });
  };

  function displayValue(key: keyof Captured): string {
    const v = captured[key];
    if (key === "rating") return captured.rating ? `${captured.rating}/5 ★` : "";
    if (Array.isArray(v)) return v.join(", ");
    if (key === "next_action") return NEXT_LABELS[captured.next_action] ?? toStr(v);
    return toStr(v);
  }

  const FIELDS: { key: keyof Captured; label: string; type: "text" | "tel" | "number" }[] = [
    { key: "name", label: "Name", type: "text" },
    { key: "mobile", label: "WhatsApp number", type: "tel" },
    { key: "rating", label: "Visit rating", type: "number" },
    { key: "concerns", label: "Concerns", type: "text" },
    { key: "next_action", label: "Wants next", type: "text" },
    { key: "next_action_notes", label: "Note", type: "text" },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const statusLabel =
    phase === "connecting"
      ? "Connecting…"
      : phase === "live"
        ? speaking
          ? "Maiyuri is speaking"
          : "Listening…"
        : phase === "review"
          ? "Review"
          : phase === "submitting"
            ? "Sending…"
            : "Voice";

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Talk to Maiyuri">
      <div className={styles.panel}>
        <div className={styles.top}>
          <button type="button" className={styles.closeBtn} onClick={() => { teardown(); onClose(); }}>
            ✕ Close
          </button>
          <span className={styles.statusPill}>{statusLabel}</span>
        </div>

        {/* CONSENT */}
        {phase === "consent" && (
          <div className={styles.stage}>
            <div className={styles.orb} aria-hidden="true">🎙️</div>
            <h2 className={styles.title}>Talk to Maiyuri, {lead.first_name}</h2>
            <p className={styles.sub}>
              Have a quick spoken chat about your factory visit — just like talking to our team.
              You can switch to the tap form anytime.
            </p>
            <p className={styles.consent}>
              We&apos;ll use your microphone for this conversation. A transcript may be saved to
              improve our service and follow up on your request. Nothing is shared outside Maiyuri.
            </p>
            <button type="button" className={styles.primary} onClick={start}>
              Start talking
            </button>
            <button type="button" className={styles.secondary} onClick={onFallback}>
              Use the tap form instead
            </button>
          </div>
        )}

        {/* CONNECTING / LIVE */}
        {(phase === "connecting" || phase === "live") && (
          <div className={styles.stage}>
            <div
              className={`${styles.orb} ${
                phase === "live" ? (speaking ? styles.orbSpeaking : styles.orbListening) : ""
              }`}
              aria-hidden="true"
            >
              {speaking ? "🔊" : "🎧"}
            </div>
            <h2 className={styles.title}>
              {phase === "connecting" ? "Connecting…" : speaking ? "Maiyuri is speaking" : "I'm listening"}
            </h2>
            <p className={styles.transcript}>{heard || (phase === "live" ? "Say hello to begin…" : "")}</p>
            {phase === "live" && (
              <button type="button" className={styles.endBtn} onClick={endConversation} style={{ marginTop: 18 }}>
                End conversation
              </button>
            )}
          </div>
        )}

        {/* REVIEW (field-confirmation grid) */}
        {(phase === "review" || phase === "submitting") && (
          <div className={styles.review}>
            <h2 className={styles.reviewH}>Quick check before we send</h2>
            <p className={styles.reviewSub}>
              Tap any line to fix it. This goes straight to our team.
            </p>
            <div className={styles.grid}>
              {FIELDS.map(({ key, label, type }) => {
                const val = displayValue(key);
                const isEditing = editing === key;
                return (
                  <div key={key} className={styles.field}>
                    <div className={styles.fieldMain}>
                      <p className={styles.fieldLabel}>{label}</p>
                      {isEditing ? (
                        <input
                          className={styles.fieldInput}
                          type={type}
                          inputMode={type === "tel" || type === "number" ? "numeric" : "text"}
                          defaultValue={
                            key === "rating"
                              ? captured.rating?.toString() ?? ""
                              : Array.isArray(captured[key])
                                ? (captured[key] as string[]).join(", ")
                                : toStr(captured[key])
                          }
                          autoFocus
                          onBlur={(e) => {
                            setField(key, e.target.value);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      ) : (
                        <p className={`${styles.fieldValue} ${!val ? styles.fieldEmpty : ""}`}>
                          {val || "Not captured — tap to add"}
                        </p>
                      )}
                    </div>
                    {phase === "review" && !isEditing && (
                      <button type="button" className={styles.editBtn} onClick={() => setEditing(key)}>
                        Edit
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className={styles.primary}
              onClick={submit}
              disabled={phase === "submitting"}
            >
              {phase === "submitting" ? "Sending…" : "Confirm & send to Maiyuri"}
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </div>
        )}

        {/* ERROR / FALLBACK */}
        {phase === "error" && (
          <div className={styles.stage}>
            <div className={styles.orb} aria-hidden="true">💬</div>
            <h2 className={styles.title}>Let&apos;s use the tap form</h2>
            <p className={styles.sub}>{error || "Voice isn't available right now."}</p>
            <button type="button" className={styles.primary} onClick={onFallback}>
              Continue with tap form
            </button>
            <button type="button" className={styles.secondary} onClick={start}>
              Try voice again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceFeedbackClient;
