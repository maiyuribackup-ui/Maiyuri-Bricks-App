"use client";

/**
 * InfoHint — a small ℹ️ icon that reveals a guidance tooltip on hover/focus.
 * Pure Tailwind (group-hover/focus), no external deps. `title` provides an
 * accessible/native fallback and helps on touch devices.
 */
export function InfoHint({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={`group relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label="More information"
        title={text}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 text-[10px] font-semibold leading-none text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        onClick={(e) => e.preventDefault()}
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-700"
      >
        {text}
      </span>
    </span>
  );
}
