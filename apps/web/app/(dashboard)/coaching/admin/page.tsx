"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Card, Button, cn } from "@maiyuri/ui";
import { toast } from "sonner";
import type {
  CoachModule,
  CoachAssignment,
  CoachKnowledgeArticle,
} from "@maiyuri/shared";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load");
  return (await res.json()).data as T;
}
async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return (await res.json()).data;
}

const TABS = ["Content", "Assignments", "Knowledge", "Learners"] as const;
type Tab = (typeof TABS)[number];

// ---------------------------------------------------------------- Content tab
function ContentTab() {
  const qc = useQueryClient();
  const { data: modules } = useQuery({ queryKey: ["coaching", "modules", "admin"], queryFn: () => getJSON<CoachModule[]>("/api/coaching/modules") });
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [selModule, setSelModule] = useState<string>("");

  const createModule = useMutation({
    mutationFn: () =>
      postJSON("/api/coaching/modules", {
        slug: slugify(title),
        title,
        description: desc || null,
        role_applicability: [],
      }),
    onSuccess: () => {
      toast.success("Module created");
      setTitle(""); setDesc("");
      qc.invalidateQueries({ queryKey: ["coaching", "modules", "admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-semibold">New module</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Module title"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <Button size="sm" disabled={!title || createModule.isPending} onClick={() => createModule.mutate()}>
          {createModule.isPending ? "Creating…" : "Create module"}
        </Button>
      </Card>

      <Card className="p-5">
        <h3 className="mb-2 text-sm font-semibold">Modules</h3>
        <div className="space-y-1">
          {(modules || []).map((m) => (
            <button key={m.id} onClick={() => setSelModule(m.id === selModule ? "" : m.id)}
              className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                selModule === m.id ? "bg-amber-50 dark:bg-amber-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800")}>
              <span>{m.title}</span>
              <span className="text-xs text-slate-400">{m.is_active ? "active" : "retired"}</span>
            </button>
          ))}
          {(modules || []).length === 0 && <p className="text-sm text-slate-400">No modules yet.</p>}
        </div>
      </Card>

      {selModule && <LessonManager moduleId={selModule} />}
    </div>
  );
}

function LessonManager({ moduleId }: { moduleId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["coaching", "module", moduleId, "admin"],
    queryFn: () => getJSON<{ module: CoachModule; lessons: { id: string; title: string }[] }>(`/api/coaching/modules/${moduleId}`),
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selLesson, setSelLesson] = useState("");

  const createLesson = useMutation({
    mutationFn: () =>
      postJSON("/api/coaching/lessons", { module_id: moduleId, slug: slugify(title), title, content }),
    onSuccess: () => {
      toast.success("Lesson added");
      setTitle(""); setContent("");
      qc.invalidateQueries({ queryKey: ["coaching", "module", moduleId, "admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="space-y-3 p-5">
      <h3 className="text-sm font-semibold">Lessons in “{data?.module.title}”</h3>
      <div className="space-y-1">
        {(data?.lessons || []).map((l) => (
          <button key={l.id} onClick={() => setSelLesson(l.id === selLesson ? "" : l.id)}
            className={cn("flex w-full rounded-md px-3 py-1.5 text-left text-sm",
              selLesson === l.id ? "bg-amber-50 dark:bg-amber-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800")}>
            📘 {l.title}
          </button>
        ))}
      </div>
      <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Lesson content (markdown)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <Button size="sm" disabled={!title || createLesson.isPending} onClick={() => createLesson.mutate()}>
          {createLesson.isPending ? "Adding…" : "Add lesson"}
        </Button>
      </div>
      {selLesson && <QuizManager lessonId={selLesson} />}
    </Card>
  );
}

function QuizManager({ lessonId }: { lessonId: string }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("A) ...\nB) ...\nC) ...");
  const [correct, setCorrect] = useState("C");

  const createQuiz = useMutation({
    mutationFn: () => {
      const opts = options.split("\n").map((line) => {
        const m = line.match(/^\s*([A-Za-z0-9]+)[).]\s*(.+)$/);
        return m ? { key: m[1], label: m[2] } : null;
      }).filter(Boolean);
      return postJSON("/api/coaching/quizzes", {
        slug: slugify(question).slice(0, 60) + "-" + Date.now(),
        lesson_id: lessonId,
        question,
        question_type: "mcq",
        options_json: opts,
        correct_answer: correct,
      });
    },
    onSuccess: () => {
      toast.success("Quiz added");
      setQuestion("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <h4 className="text-xs font-semibold uppercase text-slate-400">Add MCQ quiz</h4>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
      <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={4}
        className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-600 dark:bg-slate-800" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Correct key:</span>
        <input value={correct} onChange={(e) => setCorrect(e.target.value)}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <Button size="sm" disabled={!question || createQuiz.isPending} onClick={() => createQuiz.mutate()}>
          {createQuiz.isPending ? "…" : "Add quiz"}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Assignments tab
function AssignmentsAdminTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["coaching", "assignments", "admin"], queryFn: () => getJSON<CoachAssignment[]>("/api/coaching/assignments") });
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const create = useMutation({
    mutationFn: () => postJSON("/api/coaching/assignments", { slug: slugify(title), title, description: desc || null }),
    onSuccess: () => { toast.success("Assignment created"); setTitle(""); setDesc(""); qc.invalidateQueries({ queryKey: ["coaching", "assignments", "admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-5">
        <h3 className="text-sm font-semibold">New assignment</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Instructions"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <Button size="sm" disabled={!title || create.isPending} onClick={() => create.mutate()}>Create</Button>
      </Card>
      <Card className="p-5">
        <h3 className="mb-2 text-sm font-semibold">Assignments</h3>
        {(data || []).map((a) => (
          <div key={a.id} className="border-b border-slate-100 py-2 text-sm dark:border-slate-700">{a.title}</div>
        ))}
        {(data || []).length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
      </Card>
    </div>
  );
}

// -------------------------------------------------------------- Knowledge tab
function KnowledgeAdminTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["coaching", "knowledge", "admin"], queryFn: () => getJSON<CoachKnowledgeArticle[]>("/api/coaching/knowledge") });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const create = useMutation({
    mutationFn: () => postJSON("/api/coaching/knowledge", { slug: slugify(title), title, content, category: "faq" }),
    onSuccess: () => { toast.success("Article added"); setTitle(""); setContent(""); qc.invalidateQueries({ queryKey: ["coaching", "knowledge", "admin"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-5">
        <h3 className="text-sm font-semibold">New knowledge article</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Content"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
        <Button size="sm" disabled={!title || create.isPending} onClick={() => create.mutate()}>Create</Button>
      </Card>
      <Card className="p-5">
        <h3 className="mb-2 text-sm font-semibold">Articles</h3>
        {(data || []).map((k) => (
          <div key={k.id} className="border-b border-slate-100 py-2 text-sm dark:border-slate-700">
            <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-700">{k.category}</span>
            {k.title}
          </div>
        ))}
        {(data || []).length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
      </Card>
    </div>
  );
}

// --------------------------------------------------------------- Learners tab
interface LearnerReport {
  userId: string;
  name: string;
  training_path: string;
  progress: { trainingCompletionPct: number; quizAveragePct: number };
  weakArea: string | null;
  pendingSubmissions: number;
}
function LearnersTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["coaching", "admin", "progress"], queryFn: () => getJSON<LearnerReport[]>("/api/coaching/admin/progress") });
  const [targetUser, setTargetUser] = useState("");
  const [targetTitle, setTargetTitle] = useState("");

  const assign = useMutation({
    mutationFn: () => postJSON("/api/coaching/targets", { user_id: targetUser, title: targetTitle, target_type: "custom", frequency: "daily" }),
    onSuccess: () => { toast.success("Target assigned"); setTargetTitle(""); qc.invalidateQueries({ queryKey: ["coaching", "admin", "progress"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Learner progress</h3>
        <div className="space-y-2">
          {(data || []).map((r) => (
            <div key={r.userId} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">{r.name}</div>
                <div className="text-xs text-slate-400">
                  {r.training_path.replace(/_/g, " ")} · {r.progress.trainingCompletionPct}% trained · quiz {r.progress.quizAveragePct}%
                  {r.weakArea && <span className="text-rose-500"> · weak: {r.weakArea}</span>}
                  {r.pendingSubmissions > 0 && <span className="text-amber-500"> · {r.pendingSubmissions} to review</span>}
                </div>
              </div>
              <button onClick={() => setTargetUser(r.userId)}
                className={cn("rounded px-2 py-1 text-xs", targetUser === r.userId ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-slate-700")}>
                {targetUser === r.userId ? "Selected" : "Assign target"}
              </button>
            </div>
          ))}
          {(data || []).length === 0 && <p className="text-sm text-slate-400">No learners yet.</p>}
        </div>
      </Card>

      {targetUser && (
        <Card className="space-y-2 p-5">
          <h3 className="text-sm font-semibold">Assign daily target</h3>
          <input value={targetTitle} onChange={(e) => setTargetTitle(e.target.value)} placeholder="e.g. Follow up with 5 leads"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" />
          <Button size="sm" disabled={!targetTitle || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? "Assigning…" : "Assign"}
          </Button>
        </Card>
      )}
    </div>
  );
}

export default function CoachingAdminPage() {
  const [tab, setTab] = useState<Tab>("Content");
  const { data: me, isLoading } = useQuery({
    queryKey: ["coaching", "me"],
    queryFn: () => getJSON<{ isAdmin: boolean }>("/api/coaching/me"),
  });

  if (isLoading) return <Card className="p-8 text-center text-sm text-slate-400">Loading…</Card>;
  if (!me?.isAdmin) {
    return (
      <Card className="p-8 text-center text-sm text-slate-500">
        Admin access required. <Link href="/coaching" className="underline">Back to Coach</Link>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/coaching" className="text-xs text-slate-400">← Coach</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Coaching Admin</h1>
        <p className="text-sm text-slate-500">Manage content, assignments, knowledge and learners.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium",
              tab === t ? "border-b-2 border-amber-500 text-slate-900 dark:text-white" : "text-slate-500")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Content" && <ContentTab />}
      {tab === "Assignments" && <AssignmentsAdminTab />}
      {tab === "Knowledge" && <KnowledgeAdminTab />}
      {tab === "Learners" && <LearnersTab />}
    </div>
  );
}
