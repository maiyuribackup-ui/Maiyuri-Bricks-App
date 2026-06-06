"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Card, Button, cn } from "@maiyuri/ui";
import type { CoachQuiz, CoachQuizOption } from "@maiyuri/shared";

interface AttemptResult {
  is_correct: boolean | null;
  score: number;
  pending: boolean;
  correct_answer: string | null;
  explanation: string | null;
  suggested_lesson_id: string | null;
  feedback: string | null;
  gaps: string[] | null;
}

export default function QuizRunnerPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const qc = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);

  const { data: quiz, isLoading } = useQuery({
    queryKey: ["coaching", "quiz", quizId],
    queryFn: async (): Promise<CoachQuiz> => {
      const res = await fetch(`/api/coaching/quizzes/${quizId}`);
      if (!res.ok) throw new Error("Failed");
      return (await res.json()).data;
    },
  });

  const submit = useMutation({
    mutationFn: async (): Promise<AttemptResult> => {
      const res = await fetch(`/api/coaching/quizzes/${quizId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_answer: answer }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      return (await res.json()).data;
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["coaching", "me"] });
    },
  });

  if (isLoading || !quiz) {
    return <Card className="p-8 text-center text-sm text-slate-400">Loading quiz…</Card>;
  }

  const isChoice = quiz.question_type === "mcq";
  const options = (quiz.options_json as CoachQuizOption[]) || [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/coaching/learn" className="text-xs text-slate-400">← Library</Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Quick Quiz</h1>
      </div>

      <Card className="space-y-4 p-5">
        <p className="text-base font-medium text-slate-900 dark:text-white">{quiz.question}</p>

        {isChoice ? (
          <div className="space-y-2">
            {options.map((opt) => (
              <button
                key={opt.key}
                disabled={!!result}
                onClick={() => setAnswer(opt.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm",
                  answer === opt.key
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
                )}
              >
                <span className="font-semibold text-slate-500">{opt.key}.</span>
                <span className="text-slate-800 dark:text-slate-200">{opt.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <textarea
            value={answer}
            disabled={!!result}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            placeholder="Type your answer…"
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
        )}

        {!result ? (
          <Button onClick={() => submit.mutate()} disabled={!answer || submit.isPending} className="w-full">
            {submit.isPending ? "Checking…" : "Submit answer"}
          </Button>
        ) : (
          <div
            className={cn(
              "rounded-lg p-4 text-sm",
              result.pending
                ? "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200"
                : result.is_correct
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
                  : "bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200",
            )}
          >
            <div className="font-semibold">
              {result.pending
                ? "📝 Submitted for review"
                : result.is_correct
                  ? "✅ Correct!"
                  : "❌ Not quite"}
            </div>
            {result.explanation && <p className="mt-1">{result.explanation}</p>}
            {result.feedback && <p className="mt-2">{result.feedback}</p>}
            {result.gaps && result.gaps.length > 0 && (
              <div className="mt-2">
                <p className="font-medium">To improve:</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  {result.gaps.map((gap, i) => (
                    <li key={`${i}-${gap}`}>{gap}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.suggested_lesson_id && (
              <Link
                href={`/coaching/learn/${result.suggested_lesson_id}`}
                className="mt-2 inline-block font-medium underline"
              >
                Revise the related lesson →
              </Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
