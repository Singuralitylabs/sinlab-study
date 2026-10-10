// Kept free of zod so the learner quiz page (a client component) can import these without
// pulling the validation library into its bundle; the schemas live in app/lib/quiz.ts.

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
