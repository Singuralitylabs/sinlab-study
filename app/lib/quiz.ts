import { z } from "zod";

/** Single source for quiz question formats; must match the quiz_questions.question_type CHECK. */
export const QUIZ_QUESTION_TYPES = ["single", "multiple", "text"] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export const QUIZ_QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  single: "選択式（単一）",
  multiple: "選択式（複数）",
  text: "入力式",
};

// Bounds mirror quiz_questions_shape_check in the migration; a looser value here would turn a
// validation error into a 500 from the DB.
export const QUIZ_MIN_QUESTIONS = 1;
export const QUIZ_MAX_QUESTIONS = 3;
export const QUIZ_MIN_CHOICES = 2;
export const QUIZ_MAX_CHOICES = 6;
export const QUIZ_TEXT_ANSWER_MAX_LENGTH = 2000;

const nonBlank = (label: string) =>
  z
    .string({ message: `${label}は文字列で指定してください` })
    .refine((value) => value.trim().length > 0, { message: `${label}を入力してください` });

const optionalText = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value?.trim() ? value : null));

/**
 * One question as the admin form and POST/PUT /api/manage/contents send it. Field names follow the
 * manuscript headings (設問 / 形式 / 選択肢 / 正解 / 解説 / ヒント); `model_answer` is 正解 for
 * the text format.
 */
export const QuizQuestionSchema = z
  .object({
    question_type: z.enum(QUIZ_QUESTION_TYPES, {
      message: `設問の形式は ${QUIZ_QUESTION_TYPES.join(" / ")} で指定してください`,
    }),
    question: nonBlank("設問"),
    choices: z.array(nonBlank("選択肢")).default([]),
    correct_choices: z
      .array(z.number().int({ message: "正解は選択肢の番号（整数）で指定してください" }).min(0))
      .default([]),
    model_answer: optionalText,
    explanation: optionalText,
    hint: optionalText,
  })
  .superRefine((value, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });
    if (value.question_type === "text") {
      if (value.choices.length > 0) fail("入力式の設問には選択肢を指定できません", "choices");
      if (value.correct_choices.length > 0) {
        fail("入力式の設問には正解の選択肢を指定できません", "correct_choices");
      }
      if (!value.model_answer) fail("入力式の設問には模範解答を入力してください", "model_answer");
      return;
    }
    if (value.choices.length < QUIZ_MIN_CHOICES || value.choices.length > QUIZ_MAX_CHOICES) {
      fail(`選択肢は${QUIZ_MIN_CHOICES}〜${QUIZ_MAX_CHOICES}個にしてください`, "choices");
    }
    if (new Set(value.correct_choices).size !== value.correct_choices.length) {
      fail("正解の選択肢が重複しています", "correct_choices");
    }
    if (value.correct_choices.some((index) => index >= value.choices.length)) {
      fail("正解に存在しない選択肢が指定されています", "correct_choices");
    }
    if (value.question_type === "single" && value.correct_choices.length !== 1) {
      fail("単一選択の設問は正解を1つ選んでください", "correct_choices");
    }
    if (value.question_type === "multiple" && value.correct_choices.length === 0) {
      fail("複数選択の設問は正解を1つ以上選んでください", "correct_choices");
    }
  })
  .transform((value) =>
    // Normalize so the stored row satisfies the DB shape check regardless of stale form state.
    value.question_type === "text"
      ? { ...value, choices: [], correct_choices: [] }
      : {
          ...value,
          model_answer: null,
          correct_choices: [...value.correct_choices].sort((a, b) => a - b),
        }
  );

export const QuizQuestionsSchema = z
  .array(QuizQuestionSchema, { message: "設問は配列で指定してください" })
  .min(QUIZ_MIN_QUESTIONS, { message: `設問を${QUIZ_MIN_QUESTIONS}つ以上登録してください` })
  .max(QUIZ_MAX_QUESTIONS, { message: `設問は${QUIZ_MAX_QUESTIONS}つまでです` });

export type QuizQuestionInput = z.input<typeof QuizQuestionSchema>;
export type QuizQuestionData = z.output<typeof QuizQuestionSchema>;

/** A question as learners receive it before answering (get_quiz_questions). No answers. */
export type QuizQuestionForLearner = {
  id: number;
  question_type: QuizQuestionType;
  question: string;
  choices: string[];
  hint: string | null;
};

/** Per-question result returned after answering (grade_quiz_answers). */
export type QuizQuestionResult = {
  questionId: number;
  questionType: QuizQuestionType;
  /** null for the text format, which is not auto-graded. */
  isCorrect: boolean | null;
  correctChoices: number[];
  modelAnswer: string | null;
  explanation: string | null;
};

export function isQuizQuestionType(value: string): value is QuizQuestionType {
  return (QUIZ_QUESTION_TYPES as readonly string[]).includes(value);
}
