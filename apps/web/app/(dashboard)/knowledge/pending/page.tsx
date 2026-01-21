"use client";

import { useState, useEffect, useCallback } from "react";

interface PendingEntry {
  id: string;
  source_type:
    | "objection"
    | "suggestion"
    | "coaching"
    | "conversion"
    | "call_summary";
  source_id: string | null;
  content: {
    question: string;
    suggestedAnswer: string | null;
    context: string | null;
    metadata: Record<string, unknown>;
  };
  frequency: number;
  status: "pending" | "approved" | "rejected" | "merged";
  created_at: string;
  updated_at: string;
}

interface QueueStats {
  total: number;
  bySourceType: Record<string, number>;
  topFrequency: { question: string; frequency: number }[];
}

const sourceTypeLabels: Record<string, string> = {
  objection: "Customer Objection",
  suggestion: "AI Suggestion",
  coaching: "Training Gap",
  conversion: "Success Story",
  call_summary: "Call Question",
};

const sourceTypeColors: Record<string, string> = {
  objection: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  suggestion: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  coaching:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  conversion:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  call_summary:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export default function PendingKnowledgePage() {
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"frequency" | "created_at">("frequency");
  const [selectedEntry, setSelectedEntry] = useState<PendingEntry | null>(null);
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sortBy,
        limit: "50",
      });
      if (filter !== "all") {
        params.set("sourceType", filter);
      }

      const response = await fetch(`/api/knowledge/pending?${params}`);
      const data = await response.json();

      if (response.ok && data.data) {
        setEntries(data.data);
      } else {
        setError(data.error || "Failed to load entries");
      }
    } catch {
      setError("Failed to load pending knowledge entries");
    } finally {
      setIsLoading(false);
    }
  }, [filter, sortBy]);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/knowledge/pending/stats");
      const data = await response.json();
      if (response.ok && data.data) {
        setStats(data.data);
      }
    } catch {
      // Stats are optional, don't show error
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchStats();
  }, [fetchEntries]);

  const handleApprove = async () => {
    if (!selectedEntry || !answer.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/knowledge/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: selectedEntry.id,
          action: "approve",
          answer: answer.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage(
          "Knowledge entry approved and added to knowledge base!",
        );
        setSelectedEntry(null);
        setAnswer("");
        fetchEntries();
        fetchStats();
      } else {
        setError(data.error || "Failed to approve entry");
      }
    } catch {
      setError("Failed to approve entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (entry: PendingEntry) => {
    if (!confirm("Are you sure you want to reject this entry?")) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/knowledge/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entry.id,
          action: "reject",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage("Entry rejected");
        if (selectedEntry?.id === entry.id) {
          setSelectedEntry(null);
          setAnswer("");
        }
        fetchEntries();
        fetchStats();
      } else {
        setError(data.error || "Failed to reject entry");
      }
    } catch {
      setError("Failed to reject entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectEntry = (entry: PendingEntry) => {
    setSelectedEntry(entry);
    setAnswer(entry.content.suggestedAnswer || "");
    setError(null);
    setSuccessMessage(null);
  };

  // Auto-hide success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-3xl">📋</span> Pending Knowledge Review
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Review AI-discovered knowledge before adding to the knowledge base
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {stats.total}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Total Pending
            </div>
          </div>
          {Object.entries(stats.bySourceType).map(([type, count]) => (
            <div
              key={type}
              className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700"
            >
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {count}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {sourceTypeLabels[type] || type}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-300">
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entry List */}
        <div className="lg:col-span-2">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Filter by Type
              </label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              >
                <option value="all">All Types</option>
                <option value="objection">Objections</option>
                <option value="suggestion">AI Suggestions</option>
                <option value="coaching">Training Gaps</option>
                <option value="conversion">Success Stories</option>
                <option value="call_summary">Call Questions</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              >
                <option value="frequency">Most Common First</option>
                <option value="created_at">Newest First</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchEntries}
                disabled={isLoading}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 transition-colors"
              >
                {isLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          {/* Entry List */}
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-5xl mb-4">✨</div>
              <p>No pending entries to review</p>
              <p className="text-sm mt-2">
                AI-discovered knowledge will appear here for your review
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => selectEntry(entry)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedEntry?.id === entry.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${sourceTypeColors[entry.source_type]}`}
                        >
                          {sourceTypeLabels[entry.source_type]}
                        </span>
                        {entry.frequency > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                            {entry.frequency}x
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-900 dark:text-white font-medium">
                        {entry.content.question}
                      </p>
                      {entry.content.context && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {entry.content.context}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReject(entry);
                      }}
                      disabled={isSubmitting}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail/Approve Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            {selectedEntry ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                  Approve Entry
                </h3>

                <div className="mb-4">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Question
                  </label>
                  <p className="text-sm text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                    {selectedEntry.content.question}
                  </p>
                </div>

                {selectedEntry.content.context && (
                  <div className="mb-4">
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      Context
                    </label>
                    <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
                      {selectedEntry.content.context}
                    </p>
                  </div>
                )}

                {selectedEntry.content.suggestedAnswer && (
                  <div className="mb-4">
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      AI Suggested Answer
                    </label>
                    <p className="text-xs text-slate-600 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-100 dark:border-blue-800">
                      {selectedEntry.content.suggestedAnswer}
                    </p>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Your Answer (Required)
                  </label>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={6}
                    placeholder="Enter the verified answer..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleApprove}
                    disabled={isSubmitting || !answer.trim()}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors"
                  >
                    {isSubmitting ? "Approving..." : "Approve & Add"}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedEntry(null);
                      setAnswer("");
                    }}
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <strong>Source:</strong>{" "}
                    {sourceTypeLabels[selectedEntry.source_type]}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <strong>Frequency:</strong> {selectedEntry.frequency}x
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <strong>Created:</strong>{" "}
                    {new Date(selectedEntry.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 text-center">
                <div className="text-4xl mb-3">👈</div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Select an entry to review and approve
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
