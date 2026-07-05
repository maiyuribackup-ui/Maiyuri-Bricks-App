"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Calculator,
  ChevronRight,
  ClipboardCheck,
  Cog,
  Database,
  FileText,
  Globe,
  HardHat,
  Image as ImageIcon,
  Handshake,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  X,
  Youtube,
} from "lucide-react";
import { onehub } from "./theme";

/* ------------------------------------------------------------------ types */
type Sop = {
  id: string;
  department: string;
  slug: string;
  title_en: string;
  title_ta: string | null;
  purpose_en: string | null;
  purpose_ta: string | null;
  steps: { en: string; ta?: string; icon?: string }[];
  warning_en: string | null;
  warning_ta: string | null;
  status: string;
  version: number;
};
type OneHubLink = {
  id: string;
  category: string;
  name: string;
  purpose: string | null;
  url: string;
};
type ChecklistData = {
  templates: { id: string; name: string; phases: { phase: string; items: { id: string; text: string }[] }[] }[];
  runs: { id: string; subject_name: string; statuses: Record<string, unknown>; completed_at: string | null }[];
};

/* ---------------------------------------------------------------- fetchers */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return (await res.json()).data as T;
}

/* -------------------------------------------------------------- department */
const DEPARTMENTS = [
  { key: "sales", label: "Sales", ta: "விற்பனை", icon: Handshake, tint: "#c0562f" },
  { key: "production", label: "Production", ta: "உற்பத்தி", icon: Cog, tint: "#b3781a" },
  { key: "dispatch", label: "Dispatch", ta: "டெலிவரி", icon: Truck, tint: "#8a5a3c" },
  { key: "accounts", label: "Accounts & Odoo", ta: "கணக்கு", icon: Calculator, tint: "#7c6bb0" },
  { key: "safety", label: "Safety", ta: "பாதுகாப்பு", icon: ShieldCheck, tint: "#3f7d4d" },
  { key: "hr", label: "HR / Admin", ta: "நிர்வாகம்", icon: Users, tint: "#2f80a8" },
] as const;

/* ---------------------------------------------------------- link icon map */
function linkIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("odoo")) return Database;
  if (n.includes("brochure")) return FileText;
  if (n.includes("calculat")) return Calculator;
  if (n.includes("gallery") || n.includes("instagram")) return ImageIcon;
  if (n.includes("whatsapp")) return MessageCircle;
  if (n.includes("map") || n.includes("review")) return MapPin;
  if (n.includes("youtube")) return Youtube;
  return Globe;
}

/* -------------------------------------------------------- static content */
// Operating-rhythm reminders mirror the app's scheduled nudges. Static config,
// not live metrics.
const REMINDERS = {
  Daily: [
    { icon: Bell, text: "Daily Production Report by 10 AM", when: "Today", level: "high" as const },
    { icon: FileText, text: "Update Odoo Leads & Follow-ups", when: "Today", level: "medium" as const },
    { icon: Truck, text: "Verify Dispatch Plan for Tomorrow", when: "Today", level: "medium" as const },
    { icon: HardHat, text: "Safety Tool Box Talk — All Units", when: "Tomorrow", level: "low" as const },
  ],
  Weekly: [
    { icon: ClipboardCheck, text: "Weekly Production vs Plan review (Sat)", when: "Saturday", level: "high" as const },
    { icon: Users, text: "Team 1:1s & new-joiner check-ins", when: "This week", level: "medium" as const },
    { icon: FileText, text: "Reconcile Odoo invoices & payments", when: "This week", level: "medium" as const },
  ],
};

// Sample KPIs — the /api/kpi/dashboard endpoint returns scores, not these
// operational figures, so these are illustrative until live-wired.
const KPIS = [
  { label: "New Leads", value: "128", delta: "+18%", up: true, icon: Users },
  { label: "Today's Production", value: "52,450", unit: "Bricks", delta: "+12%", up: true, icon: Cog },
  { label: "On-Time Deliveries", value: "92%", delta: "+5%", up: true, icon: Truck },
  { label: "Odoo Updates", value: "36", unit: "Today", delta: "+8", up: true, icon: Database },
  { label: "Pending Collections", value: "₹18.6L", delta: "-6%", up: false, icon: Calculator },
];

/* ==================================================================== page */
export default function OneHubPage() {
  const sopsQ = useQuery({ queryKey: ["onehub", "sops"], queryFn: () => getJson<Sop[]>("/api/onehub/sops") });
  const linksQ = useQuery({ queryKey: ["onehub", "links"], queryFn: () => getJson<OneHubLink[]>("/api/onehub/links") });
  const checklistQ = useQuery({ queryKey: ["onehub", "checklists"], queryFn: () => getJson<ChecklistData>("/api/onehub/checklists") });

  const [dept, setDept] = useState<(typeof DEPARTMENTS)[number] | null>(null);

  const sopCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sopsQ.data ?? []) m.set(s.department, (m.get(s.department) ?? 0) + 1);
    return m;
  }, [sopsQ.data]);

  const checklistItems = useMemo(() => {
    const phases = checklistQ.data?.templates[0]?.phases ?? [];
    return phases.flatMap((p) => p.items).slice(0, 6);
  }, [checklistQ.data]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* ---------------------------------------------------------- hero */}
      <section
        className="relative overflow-hidden rounded-2xl border p-6 sm:p-8"
        style={{
          borderColor: onehub.cardBorder,
          background: "linear-gradient(120deg, #f6e2d2 0%, #f3d9c4 45%, #efcbb0 100%)",
        }}
      >
        <div className="grid items-center gap-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-serif text-3xl font-bold sm:text-4xl" style={{ color: onehub.brand }}>
              Vanakkam! I&apos;m Mayur 👋
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: onehub.text }}>
              I&apos;m here to help you find what you need, get things done smarter,
              and build our legacy—together.
            </p>
            <a
              href="#sop-library"
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: onehub.accent }}
            >
              Explore OneHub <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="flex items-center justify-end gap-4">
            {/* Mascot slot — TODO: replace 🦚 medallion with the Mayur
                illustration at /public/onehub/mayur.png */}
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full border-4 text-6xl shadow-inner sm:h-32 sm:w-32"
              style={{ borderColor: "#ffffff", background: "#f7ceb2" }}
            >
              🦚
            </div>
            <blockquote className="hidden max-w-[160px] border-l-2 pl-3 sm:block" style={{ borderColor: onehub.accent }}>
              <p className="font-serif text-base font-semibold" style={{ color: onehub.brand }}>
                உழைப்பே உயர்வு தரும்
              </p>
              <p className="text-xs" style={{ color: onehub.text }}>
                Hard work builds greatness.
              </p>
            </blockquote>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* --------------------------------------------------- SOP library */}
        <section id="sop-library" className="scroll-mt-24">
          <SectionHeader icon={<span>📖</span>} title="SOP Library" />
          {sopsQ.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border bg-white/60" style={{ borderColor: onehub.cardBorder }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {DEPARTMENTS.map((d) => {
                const Icon = d.icon;
                const count = sopCounts.get(d.key) ?? 0;
                return (
                  <button
                    key={d.key}
                    onClick={() => setDept(d)}
                    className="group rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-md"
                    style={{ borderColor: onehub.cardBorder }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${d.tint}1a` }}>
                      <Icon className="h-5 w-5" style={{ color: d.tint }} />
                    </div>
                    <p className="mt-2 text-sm font-semibold" style={{ color: onehub.text }}>{d.label}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: onehub.accent }}>
                        View SOPs <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                      <span className="text-xs" style={{ color: onehub.textMuted }}>{count}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* -------------------------------------------------- checklist */}
        <section id="checklist" className="scroll-mt-24">
          <SectionHeader icon={<Users className="h-4 w-4" />} title="New Joiners Checklist" />
          <div className="rounded-2xl border bg-white p-4" style={{ borderColor: onehub.cardBorder }}>
            {checklistQ.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-[#f1e9dd]" />
                ))}
              </div>
            ) : checklistItems.length === 0 ? (
              <p className="text-sm" style={{ color: onehub.textMuted }}>No checklist template yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {checklistItems.map((it, i) => (
                  <li key={it.id} className="flex items-center gap-2.5 text-sm" style={{ color: onehub.text }}>
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                      style={i === 0 ? { background: onehub.low.fg, borderColor: onehub.low.fg } : { borderColor: onehub.cardBorder }}
                    >
                      {i === 0 ? <span className="text-[10px] text-white">✓</span> : null}
                    </span>
                    {it.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------- links + reminders */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section id="links" className="scroll-mt-24">
          <SectionHeader icon={<span>🔗</span>} title="Important Links" />
          <div className="rounded-2xl border bg-white p-4" style={{ borderColor: onehub.cardBorder }}>
            {linksQ.isLoading ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-[#f5efe4]" />
                ))}
              </div>
            ) : (linksQ.data ?? []).length === 0 ? (
              <p className="text-sm" style={{ color: onehub.textMuted }}>No links added yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {(linksQ.data ?? []).map((l) => {
                  const Icon = linkIcon(l.name);
                  const pending = l.url === "https://";
                  return (
                    <a
                      key={l.id}
                      href={pending ? undefined : l.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center ${pending ? "opacity-50" : "hover:shadow-md"}`}
                      style={{ borderColor: onehub.cardBorder }}
                    >
                      <Icon className="h-5 w-5" style={{ color: onehub.brand }} />
                      <span className="text-xs font-medium" style={{ color: onehub.text }}>{l.name}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section id="reminders" className="scroll-mt-24">
          <RemindersCard />
        </section>
      </div>

      {/* -------------------------------------------------------------- KPI */}
      <section id="kpi" className="scroll-mt-24">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: onehub.text }}>KPI Dashboard</h3>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: onehub.medium.bg, color: onehub.medium.fg }}>
            Sample — live wiring next
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {KPIS.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="rounded-2xl border bg-white p-4" style={{ borderColor: onehub.cardBorder }}>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${onehub.accent}14` }}>
                    <Icon className="h-4 w-4" style={{ color: onehub.accent }} />
                  </div>
                  <span className="text-xs" style={{ color: onehub.textMuted }}>{k.label}</span>
                </div>
                <p className="mt-2 text-2xl font-bold" style={{ color: onehub.text }}>
                  {k.value} {k.unit ? <span className="text-xs font-medium" style={{ color: onehub.textMuted }}>{k.unit}</span> : null}
                </p>
                <p className="mt-0.5 text-xs font-medium" style={{ color: k.up ? onehub.low.fg : onehub.high.fg }}>
                  {k.delta} vs yesterday
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {dept ? <SopModal dept={dept} sops={(sopsQ.data ?? []).filter((s) => s.department === dept.key)} onClose={() => setDept(null)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------- subcomponents */
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center text-base" style={{ color: onehub.accent }}>{icon}</span>
      <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: onehub.text }}>{title}</h3>
    </div>
  );
}

function RemindersCard() {
  const [tab, setTab] = useState<"Daily" | "Weekly">("Daily");
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <SectionHeader icon={<Bell className="h-4 w-4" />} title="Important Reminders" />
        <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: onehub.cardBorder }}>
          {(["Daily", "Weekly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1 text-xs font-semibold"
              style={tab === t ? { background: onehub.brand, color: "#fff" } : { background: "#fff", color: onehub.textMuted }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border bg-white p-2" style={{ borderColor: onehub.cardBorder }}>
        {REMINDERS[tab].map((r, i) => {
          const Icon = r.icon;
          const c = onehub[r.level];
          return (
            <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
              <Icon className="h-4 w-4 shrink-0" style={{ color: onehub.textMuted }} />
              <span className="flex-1 text-sm" style={{ color: onehub.text }}>{r.text}</span>
              <span className="hidden text-xs sm:block" style={{ color: onehub.textMuted }}>{r.when}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" style={{ background: c.bg, color: c.fg }}>
                {r.level}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SopModal({
  dept,
  sops,
  onClose,
}: {
  dept: (typeof DEPARTMENTS)[number];
  sops: Sop[];
  onClose: () => void;
}) {
  const [openSop, setOpenSop] = useState<Sop | null>(null);
  const Icon = dept.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: onehub.cardBorder }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${dept.tint}1a` }}>
            <Icon className="h-5 w-5" style={{ color: dept.tint }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold" style={{ color: onehub.brand }}>{dept.label} SOPs</p>
            <p className="text-xs" style={{ color: onehub.textMuted }}>{dept.ta}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5" style={{ color: onehub.textMuted }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ background: onehub.canvas }}>
          {sops.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Sparkles className="h-8 w-8" style={{ color: onehub.textMuted }} />
              <p className="mt-2 text-sm" style={{ color: onehub.textMuted }}>
                No SOPs in {dept.label} yet — they&apos;ll appear here as the library grows.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sops.map((s) => (
                <div key={s.id} className="rounded-xl border bg-white" style={{ borderColor: onehub.cardBorder }}>
                  <button
                    onClick={() => setOpenSop(openSop?.id === s.id ? null : s)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: onehub.text }}>{s.title_en}</p>
                      {s.title_ta ? <p className="text-xs" style={{ color: onehub.textMuted }}>{s.title_ta}</p> : null}
                    </div>
                    <span className="text-xs" style={{ color: onehub.textMuted }}>{s.steps.length} steps · v{s.version}</span>
                  </button>
                  {openSop?.id === s.id ? (
                    <div className="border-t px-4 py-3" style={{ borderColor: onehub.cardBorder }}>
                      {s.purpose_en ? <p className="mb-3 text-sm" style={{ color: onehub.text }}>{s.purpose_en}</p> : null}
                      <ol className="space-y-2">
                        {s.steps.map((st, i) => (
                          <li key={i} className="flex gap-3 text-sm" style={{ color: onehub.text }}>
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: onehub.brand }}>
                              {i + 1}
                            </span>
                            <span>
                              {st.icon ? `${st.icon} ` : ""}{st.en}
                              {st.ta ? <span className="block text-xs" style={{ color: onehub.textMuted }}>{st.ta}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                      {s.warning_en ? (
                        <div className="mt-3 rounded-lg border p-3 text-sm" style={{ borderColor: onehub.high.bg, background: onehub.high.bg, color: onehub.high.fg }}>
                          ⚠️ {s.warning_en}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
