"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  QUIZ_MAX_CHOICES,
  QUIZ_MAX_QUESTIONS,
  QUIZ_MIN_CHOICES,
  QUIZ_MIN_QUESTIONS,
  QUIZ_QUESTION_TYPE_LABELS,
  QUIZ_QUESTION_TYPES,
  type QuizQuestionData,
  type QuizQuestionType,
} from "@/app/lib/quiz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type QuizQuestionDraft = {
  key: string;
  question_type: QuizQuestionType;
  question: string;
  choices: string[];
  correct_choices: number[];
  model_answer: string;
  explanation: string;
  hint: string;
};

let draftKeySeq = 0;
function nextDraftKey() {
  draftKeySeq += 1;
  return `quiz-question-${draftKeySeq}`;
}

export function createEmptyQuizQuestion(): QuizQuestionDraft {
  return {
    key: nextDraftKey(),
    question_type: "single",
    question: "",
    choices: ["", "", "", ""],
    correct_choices: [],
    model_answer: "",
    explanation: "",
    hint: "",
  };
}

export function toQuizQuestionDrafts(questions: QuizQuestionData[]): QuizQuestionDraft[] {
  return questions.map((q) => ({
    key: nextDraftKey(),
    question_type: q.question_type,
    question: q.question,
    choices: q.question_type === "text" ? ["", "", "", ""] : q.choices,
    correct_choices: q.correct_choices,
    model_answer: q.model_answer ?? "",
    explanation: q.explanation ?? "",
    hint: q.hint ?? "",
  }));
}

/** Shapes drafts for QuizQuestionsSchema; choice fields are dropped for the text format. */
export function toQuizQuestionPayload(drafts: QuizQuestionDraft[]) {
  return drafts.map(({ key: _key, ...q }) =>
    q.question_type === "text"
      ? { ...q, choices: [], correct_choices: [] }
      : { ...q, model_answer: null }
  );
}

interface QuizQuestionsEditorProps {
  questions: QuizQuestionDraft[];
  onChange: (questions: QuizQuestionDraft[]) => void;
}

export function QuizQuestionsEditor({ questions, onChange }: QuizQuestionsEditorProps) {
  function update(index: number, patch: Partial<QuizQuestionDraft>) {
    onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function changeType(index: number, type: QuizQuestionType) {
    const current = questions[index];
    // Single keeps at most one correct choice so switching from multiple can't save two.
    const correct =
      type === "single" ? current.correct_choices.slice(0, 1) : current.correct_choices;
    update(index, { question_type: type, correct_choices: correct });
  }

  function toggleCorrect(index: number, choiceIndex: number) {
    const q = questions[index];
    if (q.question_type === "single") {
      update(index, { correct_choices: [choiceIndex] });
      return;
    }
    const correct = q.correct_choices.includes(choiceIndex)
      ? q.correct_choices.filter((c) => c !== choiceIndex)
      : [...q.correct_choices, choiceIndex].sort((a, b) => a - b);
    update(index, { correct_choices: correct });
  }

  function removeChoice(index: number, choiceIndex: number) {
    const q = questions[index];
    // Shift later answers down so they keep pointing at the same choice text.
    update(index, {
      choices: q.choices.filter((_, i) => i !== choiceIndex),
      correct_choices: q.correct_choices
        .filter((c) => c !== choiceIndex)
        .map((c) => (c > choiceIndex ? c - 1 : c)),
    });
  }

  return (
    <div className="space-y-4">
      {questions.map((q, index) => (
        <div key={q.key} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">設問 {index + 1}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(questions.filter((_, i) => i !== index))}
              disabled={questions.length <= QUIZ_MIN_QUESTIONS}
            >
              <Trash2 className="h-4 w-4" />
              削除
            </Button>
          </div>

          <div className="space-y-2">
            <Label>形式</Label>
            <div className="flex gap-2">
              {QUIZ_QUESTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => changeType(index, type)}
                  className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm transition-colors ${
                    q.question_type === type
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-muted-foreground"
                  }`}
                >
                  {QUIZ_QUESTION_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`quiz-${index}-question`}>設問（Markdown）</Label>
            <Textarea
              id={`quiz-${index}-question`}
              value={q.question}
              onChange={(e) => update(index, { question: e.target.value })}
              className="min-h-[100px] font-mono"
            />
          </div>

          {q.question_type === "text" ? (
            <div className="space-y-2">
              <Label htmlFor={`quiz-${index}-model`}>正解（模範解答・Markdown）</Label>
              <Textarea
                id={`quiz-${index}-model`}
                value={q.model_answer}
                onChange={(e) => update(index, { model_answer: e.target.value })}
                placeholder="回答後に受講生へ表示します"
                className="min-h-[80px] font-mono"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>
                選択肢（Markdown）と正解
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {q.question_type === "single" ? "正解を1つ選択" : "正解をすべて選択"}
                </span>
              </Label>
              {q.choices.map((choice, choiceIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: choices are edited by position
                <div key={choiceIndex} className="flex items-center gap-2">
                  <input
                    type={q.question_type === "single" ? "radio" : "checkbox"}
                    name={`quiz-${index}-correct`}
                    checked={q.correct_choices.includes(choiceIndex)}
                    onChange={() => toggleCorrect(index, choiceIndex)}
                    className="h-4 w-4"
                    aria-label={`選択肢${choiceIndex + 1}を正解にする`}
                  />
                  <Input
                    value={choice}
                    onChange={(e) =>
                      update(index, {
                        choices: q.choices.map((c, i) => (i === choiceIndex ? e.target.value : c)),
                      })
                    }
                    placeholder={`選択肢${choiceIndex + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeChoice(index, choiceIndex)}
                    disabled={q.choices.length <= QUIZ_MIN_CHOICES}
                    aria-label={`選択肢${choiceIndex + 1}を削除`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => update(index, { choices: [...q.choices, ""] })}
                disabled={q.choices.length >= QUIZ_MAX_CHOICES}
              >
                <Plus className="h-4 w-4" />
                選択肢を追加
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`quiz-${index}-explanation`}>解説（Markdown・回答後に表示）</Label>
            <Textarea
              id={`quiz-${index}-explanation`}
              value={q.explanation}
              onChange={(e) => update(index, { explanation: e.target.value })}
              className="min-h-[80px] font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`quiz-${index}-hint`}>ヒント（任意・回答前に表示）</Label>
            <Textarea
              id={`quiz-${index}-hint`}
              value={q.hint}
              onChange={(e) => update(index, { hint: e.target.value })}
              placeholder="プレーンテキストで表示されます"
              className="min-h-[60px] font-mono"
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...questions, createEmptyQuizQuestion()])}
        disabled={questions.length >= QUIZ_MAX_QUESTIONS}
      >
        <Plus className="h-4 w-4" />
        設問を追加（最大{QUIZ_MAX_QUESTIONS}問）
      </Button>
    </div>
  );
}
