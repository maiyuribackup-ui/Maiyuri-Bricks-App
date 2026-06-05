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

// Human-readable labels for the option tokens, so the review card never shows
// raw machine tokens like "brick_quality" or "1_3m".
const TOKEN_LABELS: Partial<Record<keyof Captured, Record<string, string>>> = {
  build_type: {
    individual_home: "Individual home / Villa",
    farmhouse: "Farmhouse",
    compound_wall: "Compound wall",
    commercial: "Commercial building",
    architect_builder: "Architect / builder",
    exploring: "Just exploring",
    other: "Something else",
  },
  impressed: {
    brick_quality: "Quality of the bricks",
    strength: "Strength & durability",
    natural_soil: "Natural red-soil material",
    wall_finish: "Beautiful wall finish",
    cooler_home: "Cooler, comfortable homes",
    factory_process: "The factory & process",
    team_knowledge: "Knowledge of the team",
    completed_homes: "Completed project photos",
    eco: "Eco-friendly approach",
    cost_saving: "Overall cost savings",
  },
  benefits: {
    cooler: "Cooler, comfortable interiors",
    strong: "Strength & durability",
    lower_cost: "Lower overall cost",
    faster: "Faster construction",
    natural: "Natural & chemical-free",
    less_plaster: "Less plastering needed",
    eco: "Eco-friendly / low carbon",
    finish: "Beautiful natural finish",
  },
  concerns: {
    cost: "Cost / budget",
    load_bearing: "Strength for load-bearing",
    rain: "Performance in heavy rain",
    availability: "Availability / delivery",
    masons: "Finding skilled masons",
    finishing: "Wall finishing options",
    acceptance: "Family / resale acceptance",
    none: "None — convinced",
  },
  timeline: {
    within_30d: "Within 1 month",
    "1_3m": "1 – 3 months",
    "3_6m": "3 – 6 months",
    "6m_plus": "6 months or later",
    planning: "Still planning",
    architect_future: "Architect deciding / future",
  },
};

function labelFor(key: keyof Captured, token: string): string {
  if (!token) return "";
  return TOKEN_LABELS[key]?.[token] ?? token.replace(/_/g, " ");
}

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
  // Live, readable transcript of the conversation (both sides), so the visitor
  // can follow along with what Maiyuri is saying and what we heard from them.
  const [captions, setCaptions] = useState<{ role: "maiyuri" | "you"; text: string }[]>([]);
  const captionsRef = useRef<{ role: "maiyuri" | "you"; text: string }[]>([]);
  const captionScrollRef = useRef<HTMLDivElement | null>(null);

  const [extracting, setExtracting] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const transcriptRef = useRef<string>("");
  // True once the live model has emitted its submit_feedback tool call, so the
  // end-of-call finalize path knows not to also run the extraction fallback.
  const toolFiredRef = useRef<boolean>(false);
  // Full both-sided dialogue (uncapped, unlike the 14-line caption log) used as
  // the source for transcript extraction when the tool call never fired.
  const dialogueRef = useRef<{ role: "maiyuri" | "you"; text: string }[]>([]);
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

  // Append a transcript fragment to the live caption log, merging consecutive
  // fragments from the same speaker into one bubble.
  const appendCaption = useCallback((role: "maiyuri" | "you", text: string) => {
    if (!text) return;
    const arr = captionsRef.current.slice();
    const last = arr[arr.length - 1];
    if (last && last.role === role) last.text += text;
    else arr.push({ role, text });
    captionsRef.current = arr.slice(-14); // keep the log light
    setCaptions(captionsRef.current);
  }, []);

  // Accumulate the FULL both-sided dialogue (no display cap) so we can extract
  // structured fields from it if the conversation ends before the tool call.
  const appendDialogue = useCallback((role: "maiyuri" | "you", text: string) => {
    if (!text) return;
    const arr = dialogueRef.current;
    const last = arr[arr.length - 1];
    if (last && last.role === role) last.text += text;
    else arr.push({ role, text });
    if (arr.length > 200) dialogueRef.current = arr.slice(-200);
  }, []);

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

      // Maiyuri's spoken words (output transcription) → live caption log.
      const outText = sc?.outputTranscription?.text;
      if (outText) {
        appendCaption("maiyuri", outText);
        appendDialogue("maiyuri", outText);
      }

      // Visitor speech transcript — feeds the saved transcript, the caption log,
      // and clears the silence-fallback timer.
      const inText = sc?.inputTranscription?.text;
      if (inText) {
        transcriptRef.current += inText;
        setHeard(transcriptRef.current.slice(-160));
        appendCaption("you", inText);
        appendDialogue("you", inText);
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
            toolFiredRef.current = true;
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
    [captureFromArgs, appendCaption, appendDialogue],
  );

  // Auto-scroll the caption log to the newest line as it grows.
  useEffect(() => {
    const el = captionScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [captions]);

  const start = useCallback(async () => {
    setError("");
    captionsRef.current = [];
    setCaptions([]);
    transcriptRef.current = "";
    dialogueRef.current = [];
    toolFiredRef.current = false;
    setExtracting(false);
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

  // Ensure the review grid is populated even when the visitor ends the call
  // before Maiyuri finishes all questions and calls submit_feedback. Two-stage:
  //   1) Nudge the live model to submit immediately with whatever it has.
  //   2) If that doesn't land quickly, extract the fields from the transcript we
  //      already hold (server one-shot), so nothing the visitor said is lost.
  const finalizeReview = useCallback(async () => {
    if (toolFiredRef.current) return;

    // 1) Early-submit nudge to the live session.
    try {
      sessionRef.current?.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [
              {
                text: "The visitor wants to finish now. Call submit_feedback immediately with everything you have gathered so far. Do not ask any more questions.",
              },
            ],
          },
        ],
        turnComplete: true,
      });
    } catch {
      /* session may already be closing — the extraction fallback still covers us */
    }

    // 2) Give the tool call up to ~4s to arrive (handleMessage fills `captured`).
    for (let i = 0; i < 20 && !toolFiredRef.current; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (toolFiredRef.current) return;

    // 3) Fallback: extract structured fields from the full dialogue transcript.
    const dialogue = dialogueRef.current.length
      ? dialogueRef.current
          .map((d) => `${d.role === "maiyuri" ? "Maiyuri" : "Visitor"}: ${d.text.trim()}`)
          .join("\n")
          .slice(0, 20000)
      : transcriptRef.current.trim();
    if (!dialogue) return;

    setExtracting(true);
    try {
      const res = await fetch(`/api/feedback/${token}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: dialogue }),
      });
      const json = await res.json();
      if (res.ok && json?.data?.fields && !toolFiredRef.current) {
        captureFromArgs(json.data.fields as Record<string, unknown>);
      }
    } catch {
      /* leave the grid editable; the visitor can still fill it in by tap */
    } finally {
      setExtracting(false);
    }
  }, [token, captureFromArgs]);

  const endConversation = useCallback(() => {
    // Stop sending mic audio, surface the review grid, and kick off the finalize
    // (nudge → extraction) so the grid fills in even without a tool call.
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
    void finalizeReview();
  }, [finalizeReview]);

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
    if (key === "next_action") return NEXT_LABELS[captured.next_action] ?? toStr(v);
    if (Array.isArray(v)) return v.map((t) => labelFor(key, t)).join(", ");
    if (key === "build_type" || key === "timeline") return labelFor(key, toStr(v));
    return toStr(v);
  }

  // Value to seed the edit box with (humanized for token fields so the visitor
  // edits friendly text, not machine tokens).
  function editValue(key: keyof Captured): string {
    if (key === "rating") return captured.rating?.toString() ?? "";
    const v = captured[key];
    if (Array.isArray(v)) return v.map((t) => labelFor(key, t)).join(", ");
    if (key === "build_type" || key === "timeline") return labelFor(key, toStr(v));
    return toStr(v);
  }

  const FIELDS: { key: keyof Captured; label: string; type: "text" | "tel" | "number" }[] = [
    { key: "name", label: "Name", type: "text" },
    { key: "mobile", label: "WhatsApp number", type: "tel" },
    { key: "build_type", label: "Building", type: "text" },
    { key: "rating", label: "Visit rating", type: "number" },
    { key: "impressed", label: "Impressed by", type: "text" },
    { key: "benefits", label: "Benefits that matter", type: "text" },
    { key: "concerns", label: "Concerns", type: "text" },
    { key: "timeline", label: "Timeline", type: "text" },
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
            {phase === "live" && captions.length > 0 ? (
              <div className={styles.captionScroll} ref={captionScrollRef} aria-live="polite">
                {captions.map((c, i) => (
                  <div
                    key={i}
                    className={`${styles.capRow} ${c.role === "maiyuri" ? styles.capMaiyuri : styles.capYou}`}
                  >
                    <span className={styles.capWho}>{c.role === "maiyuri" ? "Maiyuri" : "You"}</span>
                    <span className={styles.capText}>{c.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.transcript}>{heard || (phase === "live" ? "Say hello to begin…" : "")}</p>
            )}
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
              {extracting
                ? "✨ Filling this in from your conversation…"
                : "Tap any line to fix it. This goes straight to our team."}
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
                          defaultValue={editValue(key)}
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
              disabled={phase === "submitting" || extracting}
            >
              {phase === "submitting"
                ? "Sending…"
                : extracting
                  ? "One moment…"
                  : "Confirm & send to Maiyuri"}
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
