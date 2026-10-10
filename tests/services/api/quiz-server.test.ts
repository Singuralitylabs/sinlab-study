import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { fetchQuizQuestions, gradeQuizAnswers } from "@/app/services/api/quiz-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

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
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        rpcResults: {
          get_quiz_questions: {
            data: [
              { id: 1, question_type: "single", question: IMG, choices: [IMG, "b"], hint: null },
            ],
            error: null,
          },
        },
      }) as never
    );

    const { data, error } = await fetchQuizQuestions(5);

    expect(error).toBeNull();
    expect(data).toEqual([
      { id: 1, question_type: "single", question: RESOLVED, choices: [RESOLVED, "b"], hint: null },
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

    const { data } = await gradeQuizAnswers(client as never, 5, [{ questionId: 2, text: "x" }]);

    expect(data[0]).toMatchObject({
      modelAnswer: RESOLVED,
      explanation: RESOLVED,
      isCorrect: null,
    });
  });

  it("RPC エラーはエラーとして返す（空の設問と区別できる）", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        rpcResults: { get_quiz_questions: { data: null, error: { message: "boom" } } },
      }) as never
    );

    const { data, error } = await fetchQuizQuestions(5);

    expect(data).toEqual([]);
    expect(error).toEqual({ message: "boom" });
  });
});
