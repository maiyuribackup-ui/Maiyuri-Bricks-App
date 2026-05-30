"use client";

/**
 * FactoryFeedbackSurvey — public, token-gated tap survey.
 *
 * Ported from the WordPress /factory-feedback/ vanilla-JS implementation
 * (Maiyuri Bricks Brochure repo: docs/plans/build_factory_feedback.py),
 * preserving the brand styling tokens and the 4-stage flow with conditional
 * next-step follow-up. Personalised landing copy comes from the GET API
 * (Phase 2). Submission goes to POST /api/feedback/[token]/submit (Phase 3a).
 *
 * Voice CTA ("Talk to Maiyuri") opens the Phase-5 live voice overlay, which is
 * code-split via next/dynamic so the Gemini Live SDK never loads unless a
 * visitor actually chooses voice.
 */

import { useMemo, useState } from "react";
import nextDynamic from "next/dynamic";
import styles from "./factory-feedback.module.css";

// Voice overlay is client-only and lazy — keeps the Live SDK out of the
// initial page bundle and off the server.
const VoiceFeedbackClient = nextDynamic(
  () => import("./voice-feedback-client").then((m) => m.VoiceFeedbackClient),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Option lists — verbatim from the WordPress generator.
// ---------------------------------------------------------------------------
const BUILD = [
  ["individual_home", "Individual home / Villa"],
  ["farmhouse", "Farmhouse"],
  ["compound_wall", "Compound wall"],
  ["commercial", "Commercial building"],
  ["architect_builder", "I’m an architect / builder"],
  ["exploring", "Just exploring"],
  ["other", "Something else"],
] as const;

const IMPRESSED = [
  ["brick_quality", "Quality of the bricks"],
  ["strength", "Strength & durability"],
  ["natural_soil", "Natural red-soil material"],
  ["wall_finish", "Beautiful wall finish"],
  ["cooler_home", "Cooler, comfortable homes"],
  ["factory_process", "The factory & process"],
  ["team_knowledge", "Knowledge of the team"],
  ["completed_homes", "Completed project photos"],
  ["eco", "Eco-friendly approach"],
  ["cost_saving", "Overall cost savings"],
] as const;

const BENEFITS = [
  ["cooler", "Cooler, comfortable interiors"],
  ["strong", "Strength & durability"],
  ["lower_cost", "Lower overall cost"],
  ["faster", "Faster construction"],
  ["natural", "Natural & chemical-free"],
  ["less_plaster", "Less plastering needed"],
  ["eco", "Eco-friendly / low carbon"],
  ["finish", "Beautiful natural finish"],
] as const;

const CONCERNS = [
  ["cost", "Cost / budget"],
  ["load_bearing", "Strength for load-bearing"],
  ["rain", "Performance in heavy rain"],
  ["availability", "Availability / delivery"],
  ["masons", "Finding skilled masons"],
  ["finishing", "Wall finishing options"],
  ["acceptance", "Family / resale acceptance"],
  ["none", "None — I'm convinced"],
] as const;

const TIMELINE = [
  ["within_30d", "Within 1 month"],
  ["1_3m", "1 – 3 months"],
  ["3_6m", "3 – 6 months"],
  ["6m_plus", "6 months or later"],
  ["planning", "Still planning"],
  ["architect_future", "Architect deciding / future"],
] as const;

const NEXT = [
  ["quote", "Get a personalised brick quantity & quotation"],
  ["floor_plan", "Share my floor plan for review"],
  ["advisor", "Speak with a Maiyuri advisor"],
  ["architect", "Arrange a discussion with my architect / builder"],
  ["visit_project", "Visit a completed Maiyuri project"],
  ["reports", "Receive test reports & product details"],
  ["sample", "Get a sample / Mudhal Sengal keepsake"],
  ["later", "I need time — follow up with me later"],
  ["exploring", "I'm only exploring at this stage"],
] as const;

const RATE_TXT = ["", "Not great", "Could be better", "It was fine", "Good visit", "Excellent visit"];

const LOGO = "https://maiyuri.com/wp-content/uploads/2026/05/maiyuri-logo-peacock-m-v2.png";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type LeadContext = {
  lead: {
    name: string;
    first_name: string;
    contact: string;
    language_preference: "en" | "ta";
    lead_type: string | null;
    status: string | null;
    current_next_action: string | null;
  };
  context: {
    latest_note_summary: string | null;
    unresolved_objections: string[];
    unfulfilled_promises: string[];
    recent_buying_stage: string | null;
    last_contact_at: string | null;
  };
};

type State = {
  name: string;
  mobile: string;
  build: string;
  rate: number;
  impressed: string[];
  benefits: string[];
  concerns: string[];
  timeline: string;
  next: string;
  cond: Record<string, string>;
  area: string;
  archName: string;
  archMobile: string;
  archLoc: string;
  visitArea: string;
  fpHelp: string[];
  repItems: string[];
  notes: string;
};

// ---------------------------------------------------------------------------
// Personalised landing copy
// ---------------------------------------------------------------------------
function buildPersonalNote(ctx: LeadContext["context"]): string | null {
  if (ctx.unresolved_objections.length > 0) {
    return `Last we spoke you mentioned ${ctx.unresolved_objections[0].toLowerCase()}. We’d love to know if today’s visit addressed that.`;
  }
  if (ctx.latest_note_summary) {
    return ctx.latest_note_summary.length > 200
      ? ctx.latest_note_summary.slice(0, 200) + "…"
      : ctx.latest_note_summary;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function FactoryFeedbackSurvey({
  token,
  context,
}: {
  token: string;
  context: LeadContext;
}) {
  const { lead } = context;
  const personalNote = useMemo(() => buildPersonalNote(context.context), [context]);

  const [step, setStep] = useState<number>(0); // 0 landing, 1-4 steps, 99 thank-you
  const [state, setState] = useState<State>({
    name: lead.name,
    mobile: lead.contact.replace(/\D/g, "").slice(-10),
    build: "",
    rate: 0,
    impressed: [],
    benefits: [],
    concerns: [],
    timeline: "",
    next: "",
    cond: {},
    area: "",
    archName: "",
    archMobile: "",
    archLoc: "",
    visitArea: "",
    fpHelp: [],
    repItems: [],
    notes: "",
  });
  const [err, setErr] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  function patch(p: Partial<State>) {
    setState((s) => ({ ...s, ...p }));
  }

  function flash(msg: string) {
    setErr(msg);
    setShakeKey((k) => k + 1);
  }

  function toggleInArray(arr: string[], val: string, max: number): { next: string[]; reachedMax: boolean } {
    if (arr.includes(val)) return { next: arr.filter((v) => v !== val), reachedMax: false };
    if (arr.length >= max) return { next: arr, reachedMax: true };
    return { next: [...arr, val], reachedMax: false };
  }

  function validateStep(n: number): boolean {
    if (n === 1) {
      if (!state.name.trim()) {
        flash("Please share your name.");
        return false;
      }
      const m = state.mobile.replace(/\D/g, "");
      if (m.length !== 10) {
        flash("Please enter a valid 10-digit WhatsApp number.");
        return false;
      }
      return true;
    }
    if (n === 2 && !state.rate) {
      flash("Please tap a star to rate your visit.");
      return false;
    }
    if (n === 4 && !state.next) {
      flash("Please choose what we can help you with next.");
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setErr("");
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goBack() {
    setErr("");
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!validateStep(4) || submitting) return;
    setSubmitting(true);
    setErr("");

    const detail: Record<string, unknown> = {};
    if (state.next === "quote") {
      if (state.cond.q_basis) detail.basis = state.cond.q_basis;
      if (state.area) detail.area_sqft = Number(state.area) || state.area;
      if (state.cond.q_brick) detail.brick = state.cond.q_brick;
    } else if (state.next === "floor_plan") {
      if (state.fpHelp.length) detail.help_with = state.fpHelp;
    } else if (state.next === "advisor") {
      if (state.cond.adv_day) detail.day = state.cond.adv_day;
      if (state.cond.adv_time) detail.time = state.cond.adv_time;
    } else if (state.next === "architect") {
      if (state.cond.arch_share) detail.share = state.cond.arch_share;
      if (state.archName) detail.architect_name = state.archName;
      if (state.archMobile) detail.architect_mobile = state.archMobile.replace(/\D/g, "");
      if (state.archLoc) detail.location = state.archLoc;
    } else if (state.next === "visit_project") {
      if (state.visitArea) detail.area = state.visitArea;
      if (state.cond.visit_day) detail.day = state.cond.visit_day;
    } else if (state.next === "reports") {
      if (state.repItems.length) detail.items = state.repItems;
    } else if (state.next === "later") {
      if (state.cond.later_when) detail.reconnect = state.cond.later_when;
    }

    const payload = {
      channel: "form" as const,
      language: lead.language_preference,
      visitor: {
        name: state.name.trim(),
        mobile: state.mobile,
        build_type: state.build || null,
      },
      visit: {
        rating: state.rate,
        impressed: state.impressed,
      },
      product: {
        benefits: state.benefits,
        concerns: state.concerns,
        timeline: state.timeline || null,
      },
      next_step: {
        action: state.next,
        detail,
        notes: state.notes.trim() || null,
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
        flash(json?.error ?? "Could not submit. Please try again.");
        setSubmitting(false);
        return;
      }
      setStep(99);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      flash("Network problem. Please try again.");
      setSubmitting(false);
    }
  }

  // --- Small render helpers ----------------------------------------------
  const isCurrent = (n: number) => step === n;
  const navShown = step >= 1 && step <= 4;

  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <header className={styles.head}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src={LOGO} alt="Maiyuri Bricks" />
          <p className={styles.brand}>MAIYURI BRICKS</p>
          <p className={styles.ta}>நம் மண். நம் வீடு. நம் அறிவு.</p>
        </header>

        {/* ---- LANDING ---- */}
        <section className={`${styles.step} ${isCurrent(0) ? styles.stepOn : ""} ${styles.landing}`}>
          <h1 className={styles.h1}>Welcome back, {lead.first_name}.</h1>
          <p className={styles.lead}>
            Thank you for visiting Maiyuri Bricks. We&apos;d love a quick word on how today went — and how we can
            help with your home. It takes less than 2 minutes.
          </p>

          {personalNote && <p className={styles.personalNote}>{personalNote}</p>}

          <div className={styles.ctaStack}>
            <button
              type="button"
              className={styles.ctaPrimary}
              onClick={() => setVoiceOpen(true)}
            >
              Talk to Maiyuri (voice)
            </button>
            <button type="button" className={styles.ctaSecondary} onClick={() => setStep(1)}>
              Tap form instead
            </button>
          </div>
          <p className={styles.reassure}>Your answers come straight to our team.</p>
        </section>

        {/* ---- PROGRESS ---- */}
        <div className={`${styles.progress} ${navShown ? styles.progressShown : ""}`}>
          <div className={styles.progBar}>
            <span className={styles.progFill} style={{ width: `${(step / 4) * 100}%` }} />
          </div>
          <p className={styles.progTxt}>Step {step} of 4</p>
        </div>

        {/* ---- STEP 1 — visitor ---- */}
        <section className={`${styles.step} ${isCurrent(1) ? styles.stepOn : ""}`}>
          <p className={styles.q}>Your name <span className={styles.req}>*</span></p>
          <input
            className={styles.input}
            type="text"
            value={state.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Full name"
            autoComplete="name"
          />
          <p className={styles.q}>WhatsApp number <span className={styles.req}>*</span></p>
          <input
            className={styles.input}
            type="tel"
            inputMode="numeric"
            value={state.mobile}
            onChange={(e) => patch({ mobile: e.target.value })}
            placeholder="10-digit mobile"
            autoComplete="tel"
          />
          <p className={styles.hint}>So our team can follow up and send what you ask for.</p>

          <p className={styles.q}>What are you planning to build?</p>
          <div className={styles.opts}>
            {BUILD.map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`${styles.opt} ${state.build === v ? styles.optOn : ""}`}
                onClick={() => patch({ build: state.build === v ? "" : v })}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        {/* ---- STEP 2 — visit experience ---- */}
        <section className={`${styles.step} ${isCurrent(2) ? styles.stepOn : ""}`}>
          <p className={styles.q}>How would you rate your factory visit? <span className={styles.req}>*</span></p>
          <div className={styles.stars} role="radiogroup" aria-label="Visit rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.star} ${n <= state.rate ? styles.starOn : ""}`}
                onClick={() => patch({ rate: n })}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                ★
              </button>
            ))}
          </div>
          <p className={styles.rateTxt}>{RATE_TXT[state.rate] || ""}</p>

          <p className={styles.q}>What impressed you most? <span className={styles.max}>choose up to 3</span></p>
          <div className={styles.chips}>
            {IMPRESSED.map(([v, l]) => {
              const on = state.impressed.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                  onClick={() => {
                    const r = toggleInArray(state.impressed, v, 3);
                    if (r.reachedMax) flash("You can choose up to 3.");
                    else patch({ impressed: r.next });
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- STEP 3 — product perception ---- */}
        <section className={`${styles.step} ${isCurrent(3) ? styles.stepOn : ""}`}>
          <p className={styles.q}>Which benefits matter most for your home? <span className={styles.max}>choose up to 3</span></p>
          <div className={styles.chips}>
            {BENEFITS.map(([v, l]) => {
              const on = state.benefits.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                  onClick={() => {
                    const r = toggleInArray(state.benefits, v, 3);
                    if (r.reachedMax) flash("You can choose up to 3.");
                    else patch({ benefits: r.next });
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>

          <p className={styles.q}>Any concerns you&apos;d still like us to address?</p>
          <div className={styles.chips}>
            {CONCERNS.map(([v, l]) => {
              const on = state.concerns.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                  onClick={() => {
                    const r = toggleInArray(state.concerns, v, 8);
                    if (!r.reachedMax) patch({ concerns: r.next });
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>

          <p className={styles.q}>When are you planning to build or purchase?</p>
          <div className={styles.opts}>
            {TIMELINE.map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`${styles.opt} ${state.timeline === v ? styles.optOn : ""}`}
                onClick={() => patch({ timeline: state.timeline === v ? "" : v })}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        {/* ---- STEP 4 — next step + conditional ---- */}
        <section className={`${styles.step} ${isCurrent(4) ? styles.stepOn : ""}`}>
          <p className={styles.q}>What would you like Maiyuri to help you with next? <span className={styles.req}>*</span></p>
          <div className={`${styles.opts} ${styles.optsNext}`}>
            {NEXT.map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`${styles.opt} ${state.next === v ? styles.optOn : ""}`}
                onClick={() => patch({ next: state.next === v ? "" : v })}
              >
                {l}
              </button>
            ))}
          </div>

          {/* QUOTE */}
          <div className={`${styles.cond} ${state.next === "quote" ? styles.condOn : ""}`}>
            <p className={styles.q}>What can you share so we can prepare your estimate?</p>
            <div className={styles.opts}>
              {[
                ["have_plan", "I can share my floor plan"],
                ["know_area", "I know my approximate built-up area"],
                ["contact_me", "Please have your team contact me"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.opt} ${state.cond.q_basis === v ? styles.optOn : ""}`}
                  onClick={() =>
                    patch({ cond: { ...state.cond, q_basis: state.cond.q_basis === v ? "" : v } })
                  }
                >
                  {l}
                </button>
              ))}
            </div>
            <div className={`${styles.sub} ${state.cond.q_basis === "know_area" ? styles.subOn : ""}`}>
              <label className={styles.lbl}>Approximate built-up area (sq.ft)</label>
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                value={state.area}
                onChange={(e) => patch({ area: e.target.value })}
                placeholder="e.g. 1500"
              />
            </div>
            <p className={`${styles.q} ${styles.qSm}`}>Preferred brick option, if known</p>
            <div className={styles.opts}>
              {[
                ["mud", "Mud interlock brick"],
                ["cement", "Cement interlock brick"],
                ["guide", "I need guidance"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.opt} ${state.cond.q_brick === v ? styles.optOn : ""}`}
                  onClick={() =>
                    patch({ cond: { ...state.cond, q_brick: state.cond.q_brick === v ? "" : v } })
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* FLOOR_PLAN */}
          <div className={`${styles.cond} ${state.next === "floor_plan" ? styles.condOn : ""}`}>
            <p className={styles.note}>
              Perfect — we&apos;ll request your floor plan on WhatsApp so you can attach the PDF / photo directly.
            </p>
            <p className={styles.q}>Which part do you need help with?</p>
            <div className={styles.chips}>
              {[
                ["qty", "Brick quantity estimate"],
                ["type", "Suitable brick type"],
                ["cost", "Cost comparison"],
                ["finish", "Wall finish recommendation"],
                ["discuss", "Discussion with architect / contractor"],
              ].map(([v, l]) => {
                const on = state.fpHelp.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                    onClick={() => {
                      const r = toggleInArray(state.fpHelp, v, 5);
                      if (!r.reachedMax) patch({ fpHelp: r.next });
                    }}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ADVISOR */}
          <div className={`${styles.cond} ${state.next === "advisor" ? styles.condOn : ""}`}>
            <p className={styles.q}>When would you prefer a call?</p>
            <div className={styles.opts}>
              {[
                ["today", "Today"],
                ["tomorrow", "Tomorrow"],
                ["weekend", "This weekend"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.opt} ${state.cond.adv_day === v ? styles.optOn : ""}`}
                  onClick={() =>
                    patch({ cond: { ...state.cond, adv_day: state.cond.adv_day === v ? "" : v } })
                  }
                >
                  {l}
                </button>
              ))}
            </div>
            <p className={`${styles.q} ${styles.qSm}`}>Preferred time</p>
            <div className={styles.opts}>
              {[
                ["morning", "Morning"],
                ["afternoon", "Afternoon"],
                ["evening", "Evening"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.opt} ${state.cond.adv_time === v ? styles.optOn : ""}`}
                  onClick={() =>
                    patch({ cond: { ...state.cond, adv_time: state.cond.adv_time === v ? "" : v } })
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* ARCHITECT */}
          <div className={`${styles.cond} ${state.next === "architect" ? styles.condOn : ""}`}>
            <p className={styles.q}>Would you like to share their contact details now?</p>
            <div className={styles.opts}>
              {[
                ["now", "Yes, I will share now"],
                ["later", "I will share later on WhatsApp"],
                ["brochure", "Please send me a technical brochure to forward"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.opt} ${state.cond.arch_share === v ? styles.optOn : ""}`}
                  onClick={() =>
                    patch({ cond: { ...state.cond, arch_share: state.cond.arch_share === v ? "" : v } })
                  }
                >
                  {l}
                </button>
              ))}
            </div>
            <div className={`${styles.sub} ${state.cond.arch_share === "now" ? styles.subOn : ""}`}>
              <label className={styles.lbl}>Architect / builder name</label>
              <input className={styles.input} type="text" value={state.archName}
                onChange={(e) => patch({ archName: e.target.value })} placeholder="Name" />
              <label className={styles.lbl}>Mobile number</label>
              <input className={styles.input} type="tel" inputMode="numeric" value={state.archMobile}
                onChange={(e) => patch({ archMobile: e.target.value })} placeholder="10-digit mobile" />
              <label className={styles.lbl}>Project location</label>
              <input className={styles.input} type="text" value={state.archLoc}
                onChange={(e) => patch({ archLoc: e.target.value })} placeholder="Area / town" />
            </div>
          </div>

          {/* VISIT_PROJECT */}
          <div className={`${styles.cond} ${state.next === "visit_project" ? styles.condOn : ""}`}>
            <p className={styles.q}>Which area would be convenient for you?</p>
            <input className={styles.input} type="text" value={state.visitArea}
              onChange={(e) => patch({ visitArea: e.target.value })} placeholder="Your area / town" />
            <p className={`${styles.q} ${styles.qSm}`}>Preferred day for the visit</p>
            <div className={styles.opts}>
              {[
                ["weekday", "Weekday"],
                ["weekend", "Weekend"],
                ["suggest", "Let your team suggest"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.opt} ${state.cond.visit_day === v ? styles.optOn : ""}`}
                  onClick={() =>
                    patch({ cond: { ...state.cond, visit_day: state.cond.visit_day === v ? "" : v } })
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* REPORTS */}
          <div className={`${styles.cond} ${state.next === "reports" ? styles.condOn : ""}`}>
            <p className={styles.q}>What would you like to receive?</p>
            <div className={styles.chips}>
              {[
                ["tests", "Test reports"],
                ["spec", "Product size & specification"],
                ["finish", "Wall finish photos"],
                ["guidance", "Construction guidance"],
                ["price", "Price & delivery details"],
                ["photos", "Completed project photos"],
              ].map(([v, l]) => {
                const on = state.repItems.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                    onClick={() => {
                      const r = toggleInArray(state.repItems, v, 6);
                      if (!r.reachedMax) patch({ repItems: r.next });
                    }}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* LATER */}
          <div className={`${styles.cond} ${state.next === "later" ? styles.condOn : ""}`}>
            <p className={styles.q}>When would you like us to reconnect?</p>
            <div className={styles.opts}>
              {[
                ["1w", "In 1 week"],
                ["2w", "In 2 weeks"],
                ["1mo", "Next month"],
                ["plan_ready", "When my plan is ready"],
                ["i_contact", "I will contact Maiyuri myself"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.opt} ${state.cond.later_when === v ? styles.optOn : ""}`}
                  onClick={() =>
                    patch({ cond: { ...state.cond, later_when: state.cond.later_when === v ? "" : v } })
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <p className={styles.q}>
            Anything else you&apos;d like us to know? <span className={styles.optTag}>optional</span>
          </p>
          <textarea
            className={`${styles.input} ${styles.area}`}
            value={state.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
            placeholder="Your honest feedback helps us serve future homeowners better."
          />
        </section>

        {/* ---- NAV ---- */}
        <div className={`${styles.nav} ${navShown ? styles.navShown : ""}`}>
          <button
            type="button"
            className={styles.back}
            onClick={goBack}
            style={{ visibility: step === 1 ? "hidden" : "visible" }}
          >
            Back
          </button>
          {step < 4 ? (
            <button type="button" className={styles.next} onClick={goNext}>
              Continue
            </button>
          ) : (
            <button type="button" className={styles.send} onClick={submit} disabled={submitting}>
              {submitting ? "Sending…" : "Send to Maiyuri"}
            </button>
          )}
        </div>

        <p
          className={`${styles.err} ${shakeKey ? styles.shake : ""}`}
          key={shakeKey}
          aria-live="polite"
        >
          {err}
        </p>

        {/* ---- THANK YOU ---- */}
        <section className={`${styles.step} ${isCurrent(99) ? styles.stepOn : ""} ${styles.thanks}`}>
          <div className={styles.tick} aria-hidden="true">✓</div>
          <h2 className={styles.thH}>Nandri! Your feedback is on its way.</h2>
          <p className={styles.thS}>
            Our team has your responses. We&apos;ll follow up on WhatsApp soon.
          </p>
          <a className={styles.thLink} href="https://maiyuri.com/">
            Back to Maiyuri.com
          </a>
        </section>

        <p className={styles.foot}>Maiyuri Bricks · Ponneri, Chennai</p>
      </div>

      {voiceOpen && (
        <VoiceFeedbackClient
          token={token}
          context={context}
          onClose={() => setVoiceOpen(false)}
          onSubmitted={() => {
            setVoiceOpen(false);
            setStep(99);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onFallback={() => {
            setVoiceOpen(false);
            setStep(1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
