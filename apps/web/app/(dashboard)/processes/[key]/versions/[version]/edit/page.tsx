"use client";

/**
 * V0.1 admin authoring (PRD §19): paste a definition JSON, validate
 * (dry run), import as draft or import & publish. Partner only.
 * Also hosts the Role defaults table (who holds each process role).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  PROCESS_ROLE_LABELS,
  type ProcessRoleKey,
  type UserRole,
} from "@maiyuri/shared";
import { useAuthStore } from "@/stores/authStore";
import {
  useImportDefinition,
  useProcessDefinition,
  useProcessRoleDefaults,
  useSetRoleDefault,
  useValidateDefinition,
  type DefinitionIssue,
} from "@/hooks/useProcess";

const PROCESS_ROLES: ProcessRoleKey[] = [
  "SALES_ENGINEER",
  "FACTORY_MANAGER",
  "FINANCE",
  "MANAGING_PARTNER",
];
const ALWAYS_ELIGIBLE: UserRole[] = ["founder", "owner"];

function parseJson(text: string): { value: Record<string, unknown> | null; error: string | null } {
  if (!text.trim()) return { value: null, error: "Paste a definition first." };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, error: "The definition must be a JSON object." };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch (err) {
    return { value: null, error: err instanceof Error ? `Invalid JSON: ${err.message}` : "Invalid JSON" };
  }
}

function IssueList({ issues }: { issues: DefinitionIssue[] }) {
  if (issues.length === 0) {
    return <p className="text-sm text-emerald-700 dark:text-emerald-300">✓ No issues. Ready to import.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {issues.map((issue, i) => (
        <li
          key={`${issue.code}-${issue.stage_key ?? ""}-${i}`}
          className={`rounded-xl px-3 py-2 text-sm ${
            issue.severity === "error"
              ? "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          }`}
        >
          <span className="font-mono text-[11px] uppercase">{issue.severity} · {issue.code}</span>
          {issue.stage_key && <span className="ml-2 font-mono text-[11px]">{issue.stage_key}</span>}
          <p>{issue.message}</p>
        </li>
      ))}
    </ul>
  );
}

function RoleDefaults() {
  const query = useProcessRoleDefaults();
  const save = useSetRoleDefault();
  const [error, setError] = useState<string | null>(null);
  const data = query.data;
  if (query.isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (query.isError || !data) {
    return <p className="text-sm text-rose-600">{query.error instanceof Error ? query.error.message : "Failed to load"}</p>;
  }
  const currentFor = (role: ProcessRoleKey) => data.defaults.find((d) => d.role_key === role)?.user_id ?? "";
  const eligible = (role: ProcessRoleKey) => {
    const allowed = new Set<UserRole>([...(data.role_map[role] ?? []), ...ALWAYS_ELIGIBLE]);
    return data.users.filter((u) => allowed.has(u.role));
  };
  return (
    <div className="space-y-3">
      {PROCESS_ROLES.map((role) => (
        <div key={role} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <label htmlFor={`role-${role}`} className="w-56 text-sm font-medium text-slate-700 dark:text-slate-200">
            {PROCESS_ROLE_LABELS[role]}
          </label>
          <select
            id={`role-${role}`}
            value={currentFor(role)}
            disabled={save.isPending}
            onChange={async (e) => {
              setError(null);
              try {
                await save.mutateAsync({ role_key: role, user_id: e.target.value || null });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save");
              }
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          >
            <option value="">— nobody (role queue only) —</option>
            {eligible(role).map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

export default function ProcessEditPage() {
  const params = useParams();
  const key = String(params.key ?? "").toUpperCase();
  const version = String(params.version ?? "");
  const user = useAuthStore((s) => s.user);
  const isPartner = ["founder", "owner"].includes(user?.role ?? "");

  // Prefill the textarea with the requested version's frozen definition.
  const existing = useProcessDefinition(key && key !== "NEW" ? key : null, version !== "new" ? version : null);
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [issues, setIssues] = useState<DefinitionIssue[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const validate = useValidateDefinition();
  const importDef = useImportDefinition();

  useEffect(() => {
    const def = existing.data?.version?.definition;
    if (def && !text) setText(JSON.stringify(def, null, 2));
  }, [existing.data?.version?.id]);

  const runValidate = async () => {
    setMessage(null);
    const { value, error } = parseJson(text);
    setParseError(error);
    if (!value) return;
    try {
      const result = await validate.mutateAsync(value);
      setIssues(result.issues);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Validation failed");
    }
  };

  const runImport = async (publish: boolean) => {
    setMessage(null);
    const { value, error } = parseJson(text);
    setParseError(error);
    if (!value) return;
    if (publish && !window.confirm("Publish this version now? New cases will start on it.")) return;
    try {
      await importDef.mutateAsync({ definition: value, publish });
      setIssues([]);
      setMessage(publish ? "Imported and published." : "Imported as draft.");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Import failed");
    }
  };

  const busy = validate.isPending || importDef.isPending;

  return (
    <div className="space-y-5">
      <Link href={`/processes/${encodeURIComponent(key)}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> {key === "NEW" ? "Processes" : key}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Process authoring</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          V0.1 authoring is JSON import. Validate first; a new version number is required for every change.
        </p>
      </div>

      {!isPartner ? (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Only a Managing Partner can import process definitions or set role defaults.
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <label htmlFor="definition-json" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
              Definition JSON {version !== "new" ? `(loaded from v${version})` : ""}
            </label>
            <textarea
              id="definition-json"
              value={text}
              onChange={(e) => { setText(e.target.value); setIssues(null); }}
              rows={20}
              spellCheck={false}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              placeholder='{"process_key":"LEAD_TO_DELIVERY","name":"…","category":"SALES","version":"1.1","stages":[…]}'
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={runValidate} disabled={busy} className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">
                {validate.isPending ? "Validating…" : "Validate"}
              </button>
              <button type="button" onClick={() => runImport(false)} disabled={busy} className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">
                Import as draft
              </button>
              <button type="button" onClick={() => runImport(true)} disabled={busy} className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
                {importDef.isPending ? "Importing…" : "Import & publish"}
              </button>
            </div>
            {parseError && <p role="alert" className="mt-3 text-sm text-rose-600">{parseError}</p>}
            {message && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
            {issues && (
              <div className="mt-4">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Validation report</h2>
                <IssueList issues={issues} />
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Role defaults</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              New stages are assigned to this person; leave empty to let anyone with the role claim from the queue.
            </p>
            <RoleDefaults />
          </section>
        </>
      )}
    </div>
  );
}
