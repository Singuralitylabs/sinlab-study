import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import type { QuizQuestionData } from "@/app/lib/quiz";
import { updateContent } from "@/app/services/api/admin-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

const stored: QuizQuestionData[] = [
  {
    question_type: "single",
    question: "Q1",
    choices: ["a", "b"],
    correct_choices: [0],
    model_answer: null,
    explanation: "E1",
    hint: null,
  },
];
const edited: QuizQuestionData[] = [{ ...stored[0], question: "Q1（改）" }];
const dbError = { message: "db error", code: "PGRST001" };

function mockAdmin(learningContents: { data: unknown; error: unknown }[]) {
  const client = createMockSupabaseClient({
    tableResults: {
      quiz_questions: { data: stored, error: null },
      learning_contents: learningContents,
    },
    rpcResults: { replace_quiz_questions: { data: null, error: null } },
  });
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);
  return client;
}

const replaceCalls = (client: ReturnType<typeof mockAdmin>) =>
  vi.mocked(client.rpc).mock.calls.filter(([fn]) => fn === "replace_quiz_questions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateContent のクイズ設問（#306 レビュー対応）", () => {
  it("設問が変わっていなければ置き換えない（設問の id を振り直さない）", async () => {
    const client = mockAdmin([{ data: null, error: null }]);

    const result = await updateContent(1, {
      title: "タイトルだけ修正",
      content_type: "quiz",
      quizQuestions: stored,
    });

    expect(result.error).toBeNull();
    expect(replaceCalls(client)).toHaveLength(0);
  });

  it("設問が変わっていれば置き換える", async () => {
    const client = mockAdmin([{ data: null, error: null }]);

    const result = await updateContent(1, { content_type: "quiz", quizQuestions: edited });

    expect(result.error).toBeNull();
    expect(replaceCalls(client)).toEqual([
      ["replace_quiz_questions", { p_content_id: 1, p_questions: edited }],
    ]);
  });

  it("行の更新が失敗したら、置き換えた設問を元に戻す", async () => {
    const client = mockAdmin([{ data: null, error: dbError }]);

    const result = await updateContent(1, { content_type: "quiz", quizQuestions: edited });

    expect(result.error).toEqual(dbError);
    expect(replaceCalls(client)).toEqual([
      ["replace_quiz_questions", { p_content_id: 1, p_questions: edited }],
      ["replace_quiz_questions", { p_content_id: 1, p_questions: stored }],
    ]);
  });

  it("挿入位置が不正（例外）でも設問を元に戻してから例外を伝える", async () => {
    // Siblings fetch returns none, so insert_after_id 999 is not a live sibling.
    const client = mockAdmin([
      { data: { week_id: 3, pdf_url: null }, error: null },
      { data: [], error: null },
    ]);

    await expect(
      updateContent(1, { content_type: "quiz", quizQuestions: edited, insertAfterId: 999 })
    ).rejects.toThrow();
    expect(replaceCalls(client).at(-1)).toEqual([
      "replace_quiz_questions",
      { p_content_id: 1, p_questions: stored },
    ]);
  });
});
