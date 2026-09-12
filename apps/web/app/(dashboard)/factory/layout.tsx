"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StockTakeBanner } from "@/components/factory/shared";

const TABS = [
  { href: "/factory", label: "Overview" },
  { href: "/factory/orders", label: "Orders" },
  { href: "/factory/schedule", label: "Schedule" },
  { href: "/factory/production", label: "Production" },
  { href: "/factory/reports", label: "Reports" },
  { href: "/factory/labour", label: "Labour" },
  { href: "/factory/data", label: "Data" },
];

export default function FactoryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          🏭 Factory Ledger
        </h1>
        <p className="text-sm text-slate-500">
          Stock, orders, plan vs actual and labour — replaces the factory sheet.
          Reporting weeks run Saturday to Friday.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active =
            t.href === "/factory" ? pathname === "/factory" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <StockTakeBanner />
      {children}
    </div>
  );
}
