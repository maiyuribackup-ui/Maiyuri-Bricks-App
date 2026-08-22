"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Phase 1 ships Masters only. Demand, Production, Dispatch, Labour and
// Analytics land in later phases (see the implementation roadmap) — they are
// deliberately absent rather than stubbed, so the nav never promises a screen
// that does not work.
const TABS = [{ href: "/ops/masters", label: "Masters" }];

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Operations Control
        </h1>
        <p className="text-sm text-slate-500">
          Demand, production, dispatch and labour control. Odoo remains the ERP
          and the authoritative physical inventory.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
