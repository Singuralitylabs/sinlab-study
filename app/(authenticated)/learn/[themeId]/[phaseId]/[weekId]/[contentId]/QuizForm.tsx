"use client";

import { CheckCircle2, Loader2, RotateCcw, Send, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import {
  QUIZ_QUESTION_TYPE_LABELS,
  QUIZ_TEXT_ANSWER_MAX_LENGTH,
  type QuizQuestionForLearner,
  type QuizQuestionResult,
} from "@/app/constants/quiz";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface QuizFormProps {
  contentId: number;
  questions: QuizQuestionForLearner[];
  /** false while previewing unpublished content: grading works but progress is not recorded. */
  canRecordProgress: boolean;
  initialCompleted: boolean;
}

type Answer = { choices: number[]; text: string };

function isAnswered(question: QuizQuestionForLearner, answer: Answer | undefined): boolean {
  if (!answer) return false;
  return question.question_type === "text"
    ? answer.text.trim().length > 0
    : answer.choices.length > 0;
}

export function QuizForm({
  contentId,
  questions,
  canRecordProgress,
  initialCompleted,
}: QuizFormProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [results, setResults] = useState<Map<number, QuizQuestionResult> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressWarning, setProgressWarning] = useState<string | null>(null);

  const allAnswered = questions.every((q) => isAnswered(q, answers[q.id]));
  const autoGraded = results ? [...results.values()].filter((r) => r.isCorrect !== null) : [];
  const correctCount = autoGraded.filter((r) => r.isCorrect).length;

  function updateAnswer(questionId: number, update: (prev: Answer) => Answer) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: update(prev[questionId] ?? { choices: [], text: "" }),
    }));
  }

  function toggleChoice(question: QuizQuestionForLearner, index: number) {
    updateAnswer(question.id, (prev) => {
      if (question.question_type === "single") {
        return { ...prev, choices: [index] };
      }
      const choices = prev.choices.includes(index)
        ? prev.choices.filter((c) => c !== index)
        : [...prev.choices, index];
      return { ...prev, choices };
    });
  }

  async function markCompleted() {
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, isCompleted: true }),
      });
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      // Re-render the server page so the completion button reflects the new progress.
      router.refresh();
    } catch {
      setProgressWarning("完了状態を記録できませんでした。下のボタンから完了にしてください。");
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!allAnswered) {
      setError("すべての設問に回答してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setProgressWarning(null);
    try {
      const response = await fetch("/api/quiz/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          answers: questions.map((q) =>
            q.question_type === "text"
              ? { questionId: q.id, text: answers[q.id]?.text ?? "" }
              : { questionId: q.id, choices: answers[q.id]?.choices ?? [] }
          ),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "採点に失敗しました");
        return;
      }
      const graded: QuizQuestionResult[] = data?.results ?? [];
      setResults(new Map(graded.map((r) => [r.questionId, r])));
      if (canRecordProgress && !initialCompleted) {
        await markCompleted();
      }
    } catch {
      setError("採点中にエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRetry() {
    setAnswers({});
    setResults(null);
    setError(null);
    setProgressWarning(null);
  }

  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">このクイズには設問が登録されていません。</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {questions.map((question, questionIndex) => {
        const answer = answers[question.id];
        const result = results?.get(question.id);
        const inputType = question.question_type === "single" ? "radio" : "checkbox";
        return (
          <fieldset key={question.id} className="space-y-3" disabled={results !== null}>
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <span>設問 {questionIndex + 1}</span>
              <Badge variant="outline">{QUIZ_QUESTION_TYPE_LABELS[question.question_type]}</Badge>
              {result?.isCorrect === true && (
                <Badge className="gap-1 bg-success text-white">
                  <CheckCircle2 className="h-3 w-3" />
                  正解
                </Badge>
              )}
              {result?.isCorrect === false && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  不正解
                </Badge>
              )}
            </legend>

            <MarkdownRenderer content={question.question} />

            {question.question_type === "text" ? (
              <Textarea
                value={answer?.text ?? ""}
                onChange={(e) =>
                  updateAnswer(question.id, (prev) => ({ ...prev, text: e.target.value }))
                }
                maxLength={QUIZ_TEXT_ANSWER_MAX_LENGTH}
                placeholder="回答を入力してください"
                className="min-h-[120px]"
                aria-label={`設問 ${questionIndex + 1} の回答`}
              />
            ) : (
              <div className="space-y-2">
                {question.choices.map((choice, index) => {
                  const checked = answer?.choices.includes(index) ?? false;
                  const isCorrectChoice = result?.correctChoices.includes(index) ?? false;
                  return (
                    // A <div>, not a <label>: MarkdownRenderer emits block elements (invalid
                    // inside a label), and a link in a choice must open without toggling it.
                    // Keyboard users operate the input itself, so the row click is a shortcut.
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the input is the keyboard target
                    // biome-ignore lint/a11y/noStaticElementInteractions: same as above
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: choices are fixed per question and may repeat
                      key={index}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (results || target.closest("a") || target.tagName === "INPUT") return;
                        toggleChoice(question, index);
                      }}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                        result && isCorrectChoice
                          ? "border-success bg-success/10"
                          : result && checked
                            ? "border-destructive bg-destructive/5"
                            : "border-border"
                      }`}
                    >
                      <input
                        type={inputType}
                        name={`question-${question.id}`}
                        checked={checked}
                        onChange={() => toggleChoice(question, index)}
                        aria-labelledby={`question-${question.id}-choice-${index}`}
                        className="mt-1.5 h-4 w-4"
                      />
                      <div id={`question-${question.id}-choice-${index}`} className="flex-1">
                        <MarkdownRenderer content={choice} className="[&>*]:my-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {question.hint && !result && (
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer select-none list-none px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                  💡 ヒントを見る
                </summary>
                <div className="whitespace-pre-wrap border-t border-border px-4 py-2 text-sm text-muted-foreground">
                  {question.hint}
                </div>
              </details>
            )}

            {result && (
              <div className="space-y-3 rounded-lg bg-muted px-4 py-3">
                {result.modelAnswer && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">模範解答</h4>
                    <MarkdownRenderer content={result.modelAnswer} />
                  </div>
                )}
                {result.explanation && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold">解説</h4>
                    <MarkdownRenderer content={result.explanation} />
                  </div>
                )}
              </div>
            )}
          </fieldset>
        );
      })}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results ? (
        <div className="space-y-3">
          {autoGraded.length > 0 && (
            <p className="text-sm font-medium">
              選択式 {autoGraded.length} 問中 {correctCount} 問正解
            </p>
          )}
          {progressWarning && (
            <Alert variant="destructive">
              <AlertDescription>{progressWarning}</AlertDescription>
            </Alert>
          )}
          {!canRecordProgress && (
            <p className="text-sm text-muted-foreground">
              非公開コンテンツのプレビュー中のため、完了状態は記録されません。
            </p>
          )}
          <Button type="button" variant="outline" onClick={handleRetry}>
            <RotateCcw className="h-4 w-4" />
            もう一度解く
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={isSubmitting || !allAnswered}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          回答を送信
        </Button>
      )}
    </form>
  );
}
