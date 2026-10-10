import type { PostgrestError } from "@supabase/supabase-js";
import {
  isQuizQuestionType,
  type QuizQuestionForLearner,
  type QuizQuestionResult,
} from "@/app/lib/quiz";
import { resolveMarkdownStorageUrls } from "@/app/lib/storage-url";
import { createServerSupabaseClient } from "./supabase-server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// RETURNS TABLE columns are typed non-null by the generator, but hint / model_answer /
// explanation / is_correct can be NULL, so the rows are cast to these instead.
type QuizQuestionRpcRow = {
  id: number;
  question_type: string;
  question: string;
  choices: string[] | null;
  hint: string | null;
};
type QuizGradeRpcRow = {
  question_id: number;
  question_type: string;
  is_correct: boolean | null;
  correct_choices: number[] | null;
  model_answer: string | null;
  explanation: string | null;
};

/**
 * Questions without answers, via the get_quiz_questions RPC with the caller's JWT. Learners have
 * no SELECT on quiz_questions (it holds the answers), and the RPC re-checks visibility, so never
 * swap this for a service_role read.
 */
export async function fetchQuizQuestions(
  contentId: number
): Promise<{ data: QuizQuestionForLearner[]; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = (await supabase.rpc("get_quiz_questions", {
    p_content_id: contentId,
  })) as unknown as { data: QuizQuestionRpcRow[] | null; error: PostgrestError | null };

  if (error) {
    console.error("クイズ設問の取得エラー:", error.message);
    return { data: [], error };
  }

  return {
    data: (data ?? []).flatMap((row) =>
      isQuizQuestionType(row.question_type)
        ? [
            {
              id: row.id,
              question_type: row.question_type,
              // Same {{SUPABASE_STORAGE_URL}} handling as text_content / description.
              question: resolveMarkdownStorageUrls(row.question),
              choices: (row.choices ?? []).map(resolveMarkdownStorageUrls),
              hint: row.hint ?? null,
            },
          ]
        : []
    ),
    error: null,
  };
}

/**
 * Grades answers with the grade_quiz_answers RPC. An empty result means the content is not
 * visible or not every question was answered (the RPC returns nothing rather than leaking the
 * answers).
 */
export async function gradeQuizAnswers(
  supabase: ServerSupabaseClient,
  contentId: number,
  answers: { questionId: number; choices?: number[]; text?: string }[]
): Promise<{ data: QuizQuestionResult[]; error: PostgrestError | null }> {
  const { data, error } = (await supabase.rpc("grade_quiz_answers", {
    p_content_id: contentId,
    p_answers: answers.map((answer) => ({
      question_id: answer.questionId,
      ...(answer.choices !== undefined ? { choices: answer.choices } : {}),
      ...(answer.text !== undefined ? { text: answer.text } : {}),
    })),
  })) as unknown as { data: QuizGradeRpcRow[] | null; error: PostgrestError | null };

  if (error) {
    console.error("クイズ採点エラー:", error.message);
    return { data: [], error };
  }

  return {
    data: (data ?? []).flatMap((row) =>
      isQuizQuestionType(row.question_type)
        ? [
            {
              questionId: row.question_id,
              questionType: row.question_type,
              isCorrect: row.is_correct ?? null,
              correctChoices: row.correct_choices ?? [],
              modelAnswer: row.model_answer ? resolveMarkdownStorageUrls(row.model_answer) : null,
              explanation: row.explanation ? resolveMarkdownStorageUrls(row.explanation) : null,
            },
          ]
        : []
    ),
    error: null,
  };
}
