"use client";

import { useState } from "react";
import { Card, Button, Spinner } from "@maiyuri/ui";
import { getSupabase } from "@/lib/supabase";

interface CallGap {
  phone: string;
  name: string | null;
  calls: number;
  lastCallAt: string | null;
}

interface ReconcileResponse {
  needsColumn?: boolean;
  headers?: string[];
  totalCalls?: number;
  uniqueCallers?: number;
  matched?: number;
  leadsConsidered?: number;
  callsWithoutLead?: CallGap[];
  phoneColumn?: string;
}

async function authFetch(input: string, init: RequestInit = {}) {
  let token: string | undefined;
  try {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    token = session?.access_token;
  } catch {
    /* fall through — request will 401 */
  }
  return fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export function CallAuditTab() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [sinceDays, setSinceDays] = useState<string>("0");
  const [phoneColumn, setPhoneColumn] = useState<string>("");
  const [columns, setColumns] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ReconcileResponse | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setColumns([]);
    setPhoneColumn("");
    setResult(null);
    setStatus("idle");
    setMessage("");
  };

  const run = async () => {
    if (!csv.trim()) {
      setStatus("error");
      setMessage("Choose a Superfone CSV export first.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const res = await authFetch("/api/reconciliation/superfone", {
        method: "POST",
        body: JSON.stringify({
          csv,
          sinceDays: Number(sinceDays) || undefined,
          phoneColumn: phoneColumn || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to analyse CSV");
      const data: ReconcileResponse = json.data ?? {};
      if (data.needsColumn) {
        setColumns(data.headers ?? []);
        setStatus("idle");
        setMessage("Couldn't detect the phone column — pick it and run again.");
        return;
      }
      setResult(data);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const downloadGaps = () => {
    const gaps = result?.callsWithoutLead ?? [];
    const lines = [
      "phone,name,calls,last_call",
      ...gaps.map(
        (g) =>
          `${g.phone},"${(g.name ?? "").replace(/"/g, '""')}",${g.calls},${g.lastCallAt ?? ""}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calls-without-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const gaps = result?.callsWithoutLead ?? [];

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
        Call Audit — Superfone vs Leads
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Export your Superfone call log as CSV and upload it here. We match
        numbers (last 10 digits) against your leads and list callers that never
        became a lead.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="px-3 py-2 text-sm font-medium rounded-md bg-slate-100 dark:bg-slate-800 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
          {fileName || "Choose CSV…"}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="hidden"
          />
        </label>

        <select
          value={sinceDays}
          onChange={(e) => setSinceDays(e.target.value)}
          className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
        >
          <option value="0">Compare all leads</option>
          <option value="30">Leads from last 30 days</option>
          <option value="90">Leads from last 90 days</option>
        </select>

        {columns.length > 0 && (
          <select
            value={phoneColumn}
            onChange={(e) => setPhoneColumn(e.target.value)}
            className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
          >
            <option value="">Select phone column…</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <Button onClick={run} disabled={status === "loading" || !csv}>
          {status === "loading" ? "Analysing…" : "Analyse"}
        </Button>
      </div>

      {message && (
        <p
          className={`text-sm mb-4 ${
            status === "error"
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {message}
        </p>
      )}

      {status === "loading" && (
        <div className="flex justify-center py-8">
          <Spinner size="md" />
        </div>
      )}

      {status === "done" && result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total calls" value={result.totalCalls ?? 0} />
            <Stat label="Unique callers" value={result.uniqueCallers ?? 0} />
            <Stat label="Matched to leads" value={result.matched ?? 0} />
            <Stat
              label="No lead created"
              value={gaps.length}
              highlight={gaps.length > 0}
            />
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-900 dark:text-white">
              Callers with no lead ({gaps.length})
            </h3>
            {gaps.length > 0 && (
              <button
                onClick={downloadGaps}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Download CSV
              </button>
            )}
          </div>

          {gaps.length === 0 ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              🎉 Every caller in this export has a matching lead.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Calls</th>
                    <th className="px-3 py-2 font-medium">Last call</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {gaps.map((g) => (
                    <tr key={g.phone}>
                      <td className="px-3 py-2 font-mono">{g.phone}</td>
                      <td className="px-3 py-2">{g.name || "—"}</td>
                      <td className="px-3 py-2">{g.calls}</td>
                      <td className="px-3 py-2">{g.lastCallAt || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
      <div
        className={`text-2xl font-bold ${
          highlight
            ? "text-red-600 dark:text-red-400"
            : "text-slate-900 dark:text-white"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
