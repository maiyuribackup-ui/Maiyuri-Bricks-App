"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Card, Button } from "@maiyuri/ui";
import { toast } from "sonner";
import type { Project, ProjectTemplate, Lead } from "@maiyuri/shared";

interface SetupSuggestion {
  recommended_template_id: string | null;
  recommended_template_name: string | null;
  reasoning: string;
  suggested_timeline_days: number | null;
  suggested_resources: string[];
  risks: string[];
  source: "ai" | "heuristic";
}

const inputCls =
  "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [leadId, setLeadId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [suggestion, setSuggestion] = useState<SetupSuggestion | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["project-templates"],
    queryFn: async (): Promise<ProjectTemplate[]> => {
      const res = await fetch("/api/projects/templates");
      return res.ok ? (await res.json()).data : [];
    },
  });

  const { data: wonLeads } = useQuery({
    queryKey: ["won-leads"],
    queryFn: async (): Promise<Lead[]> => {
      const res = await fetch("/api/leads");
      if (!res.ok) return [];
      const json = await res.json();
      const list: Lead[] = Array.isArray(json) ? json : json.data ?? [];
      return list.filter((l) => l.pipeline_stage === "order_won");
    },
  });

  const aiAssist = useMutation({
    mutationFn: async (): Promise<SetupSuggestion> => {
      const res = await fetch("/api/projects/setup-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, project_type: "", quantity, notes: name }),
      });
      if (!res.ok) throw new Error("AI assist failed");
      return (await res.json()).data;
    },
    onSuccess: (s) => {
      setSuggestion(s);
      if (s.recommended_template_id) setTemplateId(s.recommended_template_id);
      toast.success(s.source === "ai" ? "AI suggestions ready" : "Suggested a template");
    },
    onError: () => toast.error("Could not get suggestions"),
  });

  const create = useMutation({
    mutationFn: async (): Promise<Project> => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          lead_id: leadId || null,
          template_id: templateId || null,
          location,
        }),
      });
      if (!res.ok) throw new Error("Create failed");
      return (await res.json()).data;
    },
    onSuccess: (p) => {
      toast.success("Project created");
      router.push(`/projects/${p.id}`);
    },
    onError: () => toast.error("Could not create project"),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">New Project</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">From a won lead or standalone. A template auto-fills WBS + BOQ.</p>
      </div>

      <Card className="space-y-4 p-6">
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-300">Project name *</span>
          <input className={inputCls + " mt-1"} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kishore Redhills — Brick Supply" />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-300">From won lead (optional)</span>
          <select
            className={inputCls + " mt-1"}
            value={leadId}
            onChange={(e) => {
              setLeadId(e.target.value);
              const l = wonLeads?.find((x) => x.id === e.target.value);
              if (l && !name) setName(`${l.name} — Project`);
            }}
          >
            <option value="">— Standalone —</option>
            {(wonLeads || []).map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.contact})</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">Location</span>
            <input className={inputCls + " mt-1"} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Redhills" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">Quantity (for AI plan)</span>
            <input type="number" className={inputCls + " mt-1"} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 12000" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-300">Template</span>
          <select className={inputCls + " mt-1"} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">— None (blank project) —</option>
            {(templates || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        <Button variant="secondary" size="sm" onClick={() => aiAssist.mutate()} disabled={aiAssist.isPending}>
          {aiAssist.isPending ? "Thinking…" : "✨ Get AI suggestions"}
        </Button>

        {suggestion && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-900/20">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {suggestion.recommended_template_name ? `Recommended: ${suggestion.recommended_template_name}` : "Suggestion"}
              {suggestion.suggested_timeline_days ? ` · ~${suggestion.suggested_timeline_days} days` : ""}
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{suggestion.reasoning}</p>
            {suggestion.risks.length > 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Risks: {suggestion.risks.join(", ")}</p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
            {create.isPending ? "Creating…" : "Create project"}
          </Button>
          <Button variant="ghost" onClick={() => router.push("/projects")}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
