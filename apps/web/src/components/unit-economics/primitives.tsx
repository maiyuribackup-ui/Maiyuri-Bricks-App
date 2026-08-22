"use client";

/**
 * Shared bits of the Standard Costs screen.
 *
 * The visual contract of the whole module: an INPUT is white with a border and
 * you can type in it; a DERIVED number is on a tinted, borderless surface and
 * you cannot. If it can be computed, it is never an input.
 */
import { inr } from "./form";

export function NumberField({
  label,
  value,
  onChange,
  issue,
  suffix,
  step = "0.01",
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  issue?: string | null;
  suffix?: string;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      ) : null}
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={issue ? true : undefined}
          className={`w-full rounded-lg border px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50 ${
            issue ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"
          }`}
        />
        {suffix ? <span className="shrink-0 text-xs text-slate-400">{suffix}</span> : null}
      </span>
      {issue ? <span className="mt-0.5 block text-xs text-red-600">{issue}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  issue,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  issue?: string | null;
  placeholder?: string;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      ) : null}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={issue ? true : undefined}
        className={`w-full rounded-lg border px-2 py-1.5 text-sm text-slate-900 ${
          issue ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"
        }`}
      />
      {issue ? <span className="mt-0.5 block text-xs text-red-600">{issue}</span> : null}
    </label>
  );
}

/** A computed value. Read-only by construction — there is no input here. */
export function Derived({
  label,
  value,
  dp = 2,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number | null;
  dp?: number;
  tone?: "neutral" | "strong" | "good" | "bad";
  hint?: string;
}) {
  const toneClass =
    tone === "strong"
      ? "bg-slate-900 text-white"
      : tone === "good"
        ? "bg-emerald-50 text-emerald-800"
        : tone === "bad"
          ? "bg-red-50 text-red-700"
          : "bg-slate-100 text-slate-700";

  return (
    <div className={`rounded-lg px-3 py-2 ${toneClass}`} title={hint}>
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-semibold tabular-nums">{inr(value, dp)}</div>
    </div>
  );
}

/** A computed value that is a count, not money. */
export function DerivedCount({ label, value, dp = 2 }: { label: string; value: number | null; dp?: number }) {
  return (
    <div className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-semibold tabular-nums">
        {value === null || !Number.isFinite(value)
          ? "—"
          : value.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
