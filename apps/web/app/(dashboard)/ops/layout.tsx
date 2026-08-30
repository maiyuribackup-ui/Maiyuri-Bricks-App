"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

// Tabs are role-filtered so nobody is shown a door they cannot open: sales
// works demand and schedules (PRD §7.3) but never masters; the API routes
// remain the real gate. Analytics lands in a later phase — deliberately
// absent rather than stubbed.
const TABS: { href: string; label: string; roles: string[] }[] = [
  {
    href: "/ops/demand",
    label: "Demand",
    roles: ["founder", "owner", "production_supervisor", "sales"],
  },
  {
    href: "/ops/inventory",
    label: "Inventory",
    roles: ["founder", "owner", "production_supervisor", "sales"],
  },
  {
    href: "/ops/production",
    label: "Production",
    roles: ["founder", "owner", "production_supervisor"],
  },
  {
    href: "/ops/dispatch",
    label: "Dispatch",
    roles: ["founder", "owner", "production_supervisor"],
  },
  {
    // Narrower than every other tab on purpose: labour is a money question,
    // so the supervisor who plans the work does not see what it pays.
    href: "/ops/labour",
    label: "Labour",
    roles: ["founder", "owner"],
  },
  {
    href: "/ops/masters",
    label: "Masters",
    roles: ["founder", "owner", "production_supervisor"],
  },
];

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const tabs = TABS.filter((t) => !role || t.roles.includes(role));
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
        {tabs.map((t) => {
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
