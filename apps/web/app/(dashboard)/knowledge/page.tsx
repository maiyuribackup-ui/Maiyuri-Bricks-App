"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  timestamp: Date;
}

interface KnowledgeGap {
  id: string;
  question_text: string;
  context?: string | null;
  status: "pending" | "task_created" | "resolved";
  task_id?: string | null;
  created_at: string;
  task?: {
    id: string;
    title: string;
    status: string;
    due_date?: string | null;
  } | null;
}

export default function KnowledgeChatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [isLoadingGaps, setIsLoadingGaps] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchGaps = async () => {
    setIsLoadingGaps(true);
    try {
      const response = await fetch("/api/knowledge/gaps");
      const data = await response.json();
      if (response.ok && data.data) {
        setGaps(data.data as KnowledgeGap[]);
      }
    } catch {
      // Keep gaps silent; knowledge chat should still work.
    } finally {
      setIsLoadingGaps(false);
    }
  };

  useEffect(() => {
    fetchGaps();
  }, []);

  const resolveGap = async (gapId: string) => {
    try {
      const response = await fetch("/api/knowledge/gaps", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gapId, status: "resolved" }),
      });
      if (response.ok) {
        setGaps((prev) => prev.filter((g) => g.id !== gapId));
      }
    } catch {
      // ignore for now
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage.content }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          data.data?.answer ||
          data.error?.message ||
          "Sorry, I couldn't find an answer.",
        citations: data.data?.sources?.map((s: any) => s.sourceId) || [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, there was an error processing your question.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center py-4 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
          <span className="text-3xl">🧠</span> Knowledge Assistant
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Ask me anything about Maiyuri Bricks
        </p>
      </div>

      {/* Knowledge Gaps */}
      <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Knowledge Gaps
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Questions from calls that need a verified answer
            </p>
          </div>
          <button
            onClick={fetchGaps}
            className="text-xs text-blue-600 hover:text-blue-700"
            disabled={isLoadingGaps}
          >
            {isLoadingGaps ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {isLoadingGaps ? (
          <p className="text-xs text-slate-400 mt-2">
            Loading knowledge gaps...
          </p>
        ) : gaps.length === 0 ? (
          <p className="text-xs text-slate-400 mt-2">No open knowledge gaps.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {gaps.map((gap) => (
              <div
                key={gap.id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-900 dark:text-white">
                      {gap.question_text}
                    </p>
                    {gap.context && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {gap.context}
                      </p>
                    )}
                    {gap.task && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Task: {gap.task.title} • {gap.task.status}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setInput(gap.question_text)}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Use in chat
                    </button>
                    <button
                      onClick={() => resolveGap(gap.id)}
                      className="text-xs text-emerald-600 hover:text-emerald-700"
                    >
                      Mark resolved
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-5xl mb-4">💬</div>
            <p>Start a conversation by asking a question</p>
            <div className="mt-4 space-y-2">
              <button
                onClick={() =>
                  setInput("What is the secret verification code?")
                }
                className="block mx-auto text-blue-500 hover:underline text-sm"
              >
                "What is the secret verification code?"
              </button>
              <button
                onClick={() => setInput("Tell me about brick specifications")}
                className="block mx-auto text-blue-500 hover:underline text-sm"
              >
                "Tell me about brick specifications"
              </button>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.citations && message.citations.length > 0 && (
                <p className="text-xs mt-2 opacity-70">
                  📚 {message.citations.join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-slate-500">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Thinking...
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Type your question..."
            className="flex-1 px-4 py-3 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold rounded-full transition-colors"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
