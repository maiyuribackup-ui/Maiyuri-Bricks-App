"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Home,
  LayoutGrid,
  Link2,
  MessageSquare,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { getSupabase } from "@/lib/supabase";
import { onehub } from "./theme";
import { AskMayurModal } from "./AskMayurModal";

// Sidebar nav — anchors into the Start Here page sections, plus links out to
// existing modules (Training → coaching). One-page v1: most items scroll.
const NAV: { label: string; icon: typeof Home; href: string }[] = [
  { label: "Start Here", icon: Home, href: "/onehub" },
  { label: "SOP Library", icon: BookOpen, href: "/onehub#sop-library" },
  { label: "New Joiners Checklist", icon: ClipboardCheck, href: "/onehub#checklist" },
  { label: "Important Links", icon: Link2, href: "/onehub#links" },
  { label: "Important Reminders", icon: Bell, href: "/onehub#reminders" },
  { label: "KPI Dashboard", icon: LayoutGrid, href: "/onehub#kpi" },
  { label: "Training", icon: GraduationCap, href: "/coaching" },
  { label: "Forms & Templates", icon: FileText, href: "/onehub#links" },
];

export default function OneHubLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [askOpen, setAskOpen] = useState(false);

  // /onehub sits outside the (dashboard) group, so its layout never runs.
  // Server-side protection is the middleware's job; here we only HYDRATE the
  // auth store from the Supabase session on a direct visit (same pattern as
  // the dashboard layout). Redirect only when there is genuinely no session.
  useEffect(() => {
    if (user) return;
    let cancelled = false;
    async function loadUser() {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) router.replace("/login");
          return;
        }
        const response = await fetch("/api/users/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.data && !cancelled) setUser(data.data);
        }
      } catch (error) {
        console.error("OneHub: error loading user:", error);
      }
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, [user, setUser, router]);

  return (
    <div className="flex min-h-screen" style={{ background: onehub.canvas }}>
      {/* Sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex"
        style={{ background: `linear-gradient(180deg, ${onehub.brandTop}, ${onehub.brandDark})` }}
      >
        <div className="flex items-center gap-3 px-6 py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/onehub/logo-mark.png" alt="Maiyuri Bricks" className="h-11 w-11" />
          <div className="leading-tight">
            <p className="font-serif text-lg font-bold tracking-wide text-white">MAIYURI</p>
            <p className="text-[11px] font-medium tracking-[0.2em] text-white/70">BRICKS</p>
          </div>
        </div>
        <p className="px-6 pb-4 text-[11px] italic text-white/55">
          Built on Strength. Rooted in Trust.
        </p>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item, i) => {
            const Icon = item.icon;
            const active = i === 0;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
                style={
                  active
                    ? { background: onehub.canvas, color: onehub.brand }
                    : { color: "rgba(255,255,255,0.82)" }
                }
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mayur helper card */}
        <div className="mx-3 mt-3 rounded-2xl bg-black/15 p-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/onehub/mayur-avatar.png" alt="Mayur" className="h-11 w-11 rounded-full bg-white/10 object-cover object-top" />
            <div className="leading-tight">
              <p className="text-xs text-white/70">Hello! I&apos;m</p>
              <p className="text-sm font-bold text-white">Mayur</p>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-white/60">
            Your guide to everything Maiyuri Bricks.
          </p>
          <button
            onClick={() => setAskOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white/95 py-2 text-sm font-semibold"
            style={{ color: onehub.brand }}
          >
            <MessageSquare className="h-4 w-4" />
            Ask Mayur
          </button>
        </div>

        <Link
          href="/dashboard"
          className="mx-3 my-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/60 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to main app
        </Link>
      </aside>

      {/* Main column */}
      <div className="flex-1 lg:pl-64">
        {/* Topbar */}
        <header
          className="sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 sm:px-6"
          style={{ background: onehub.canvas, borderColor: onehub.cardBorder }}
        >
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-2xl font-bold sm:text-[28px]" style={{ color: onehub.brand }}>
              Maiyuri OneHub
            </h1>
            <p className="hidden text-xs sm:block" style={{ color: onehub.textMuted }}>
              One place for SOPs, checklists, links, reminders and KPIs.
            </p>
          </div>

          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: onehub.textMuted }} />
            <input
              placeholder="Search SOPs, documents, links…"
              className="w-64 rounded-xl border bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: onehub.cardBorder, color: onehub.text }}
            />
          </div>

          <button
            className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white sm:flex"
            style={{ background: onehub.accent }}
          >
            <Plus className="h-4 w-4" /> Quick Create
          </button>
          <button
            className="hidden items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-sm font-semibold sm:flex"
            style={{ borderColor: onehub.cardBorder, color: onehub.text }}
          >
            <Upload className="h-4 w-4" /> Upload
          </button>
          <button
            aria-label="Notifications"
            className="relative rounded-xl border bg-white p-2"
            style={{ borderColor: onehub.cardBorder, color: onehub.text }}
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: onehub.accent }} />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full font-semibold text-white" style={{ background: onehub.brand }}>
            {(user?.name ?? "M").charAt(0).toUpperCase()}
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6">{children}</main>
      </div>

      <AskMayurModal open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
}
