import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/api/supabase-server");

import { fetchQuizQuestions, gradeQuizAnswers } from "@/app/services/api/quiz-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const IMG = "![図]({{SUPABASE_STORAGE_URL}}/thumbnails/a.png)";
const RESOLVED = "![図](https://example.supabase.co/storage/v1/object/public/thumbnails/a.png)";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("quiz-server の Storage URL 置換", () => {
  it("設問・選択肢の {{SUPABASE_STORAGE_URL}} を本文と同じく置換する", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        get_quiz_questions: {
          data: [
            {
              id: 1,
              question_type: "single",
              question: IMG,
              choices: [IMG, "b"],
              hint: null,
              revision: "abc",
            },
          ],
          error: null,
        },
      },
    });

    const { data, error } = await fetchQuizQuestions(5, client as never);

    expect(error).toBeNull();
    expect(data).toEqual([
      {
        id: 1,
        question_type: "single",
        question: RESOLVED,
        choices: [RESOLVED, "b"],
        hint: null,
        revision: "abc",
      },
    ]);
  });

  it("解説・模範解答の {{SUPABASE_STORAGE_URL}} を置換する", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        grade_quiz_answers: {
          data: [
            {
              question_id: 2,
              question_type: "text",
              is_correct: null,
              correct_choices: [],
              model_answer: IMG,
              explanation: IMG,
            },
          ],
          error: null,
        },
      },
    });

    const { data } = await gradeQuizAnswers(client as never, 5, [
      { questionId: 2, revision: "abc", text: "x" },
    ]);

    // The revision is forwarded so the RPC can reject answers to a question replaced since load.
    expect(client.rpc).toHaveBeenCalledWith("grade_quiz_answers", {
      p_content_id: 5,
      p_answers: [{ question_id: 2, revision: "abc", text: "x" }],
    });

    expect(data[0]).toMatchObject({
      modelAnswer: RESOLVED,
      explanation: RESOLVED,
      isCorrect: null,
    });
  });

  it("RPC エラーはエラーとして返す（空の設問と区別できる）", async () => {
    const client = createMockSupabaseClient({
      rpcResults: { get_quiz_questions: { data: null, error: { message: "boom" } } },
    });

    const { data, error } = await fetchQuizQuestions(5, client as never);

    expect(data).toEqual([]);
    expect(error).toEqual({ message: "boom" });
  });
});

describe("fetchQuizQuestions のクライアント", () => {
  it("クライアントを渡さなければ呼び出し元の JWT のクライアント（RLS 適用）で RPC を呼ぶ", async () => {
    const client = createMockSupabaseClient({
      rpcResults: { get_quiz_questions: { data: [], error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    await fetchQuizQuestions(7);

    expect(createServerSupabaseClient).toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("get_quiz_questions", { p_content_id: 7 });
  });
});
