import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import type { QuizQuestionData } from "@/app/lib/quiz";
import { createContent, updateContent } from "@/app/services/api/admin-server";
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

const quizRow = {
  data: { week_id: 3, pdf_url: null, content_type: "quiz", grading_rubric: null },
  error: null,
};

describe("updateContent のクイズ設問（#306 レビュー対応）", () => {
  it("設問が変わっていなければ置き換えない（設問の id を振り直さない）", async () => {
    // Leaving exercise clears grading_rubric only when the read version still matches.
    const client = mockAdmin([quizRow, { data: [{ id: 1 }], error: null }]);

    const result = await updateContent(1, {
      title: "タイトルだけ修正",
      content_type: "quiz",
      quizQuestions: stored,
    });

    expect(result.error).toBeNull();
    expect(replaceCalls(client)).toHaveLength(0);
  });

  it("設問が変わっていれば置き換える", async () => {
    const client = mockAdmin([quizRow, { data: [{ id: 1 }], error: null }]);

    const result = await updateContent(1, { content_type: "quiz", quizQuestions: edited });

    expect(result.error).toBeNull();
    expect(replaceCalls(client)).toEqual([
      ["replace_quiz_questions", { p_content_id: 1, p_questions: edited }],
    ]);
  });

  it("行の更新が失敗したら、置き換えた設問を元に戻す", async () => {
    const client = mockAdmin([quizRow, { data: null, error: dbError }]);

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
      quizRow,
      { data: [{ id: 1 }], error: null },
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

  it("採点基準の競合では置き換えた設問を戻す", async () => {
    const client = mockAdmin([
      {
        data: {
          week_id: 3,
          pdf_url: null,
          content_type: "exercise",
          grading_rubric: {
            version: 1,
            requirements: [{ key: "r1", name: "A", description: "a" }],
          },
        },
        error: null,
      },
      { data: [], error: null },
    ]);

    const result = await updateContent(1, { content_type: "quiz", quizQuestions: edited });

    expect(result.conflict).toBe(true);
    expect(replaceCalls(client)).toEqual([
      ["replace_quiz_questions", { p_content_id: 1, p_questions: edited }],
      ["replace_quiz_questions", { p_content_id: 1, p_questions: stored }],
    ]);
  });
});

describe("createContent の設問保存失敗時の取り消し（#306 レビュー対応）", () => {
  it("設問の保存に失敗したら作成した行を物理削除し、エラーを返す", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        learning_contents: [
          { data: [], error: null },
          { data: { id: 77, title: "クイズ" }, error: null },
          { data: null, error: null },
          { data: [], error: null },
        ],
      },
      rpcResults: { replace_quiz_questions: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const result = await createContent({
      title: "クイズ",
      week_id: 3,
      content_type: "quiz",
      insertAfterId: null,
      quizQuestions: edited,
    });

    expect(result).toEqual({ data: null, error: dbError });
    const builders = vi.mocked(client.from).mock.results.map((r) => r.value);
    expect(builders.some((b) => vi.mocked(b.delete).mock.calls.length > 0)).toBe(true);
    const updates = builders.flatMap((b) =>
      vi.mocked(b.update).mock.calls.map((call: unknown[]) => call[0])
    );
    expect(updates).not.toContainEqual(expect.objectContaining({ is_deleted: true }));
  });
});

describe("createContent はクイズを非公開で作り、設問の保存後に公開する（#306 レビュー対応）", () => {
  it("is_published: true のクイズは非公開で INSERT し、設問保存の後で公開に更新する", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        learning_contents: [
          { data: [], error: null },
          { data: { id: 78, title: "クイズ", is_published: false }, error: null },
          { data: { id: 78, title: "クイズ", is_published: true }, error: null },
        ],
      },
      rpcResults: { replace_quiz_questions: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const result = await createContent({
      title: "クイズ",
      week_id: 3,
      content_type: "quiz",
      insertAfterId: null,
      is_published: true,
      quizQuestions: edited,
    });

    expect(result).toEqual({ data: { id: 78, title: "クイズ", is_published: true }, error: null });
    const builders = vi.mocked(client.from).mock.results.map((r) => r.value);
    const inserts = builders.flatMap((b) =>
      vi.mocked(b.insert).mock.calls.map((call: unknown[]) => call[0])
    );
    expect(inserts).toContainEqual(expect.objectContaining({ is_published: false }));
    const updates = builders.flatMap((b) =>
      vi.mocked(b.update).mock.calls.map((call: unknown[]) => call[0])
    );
    expect(updates).toContainEqual({ is_published: true });
  });

  it("公開への更新だけが失敗したら、作成済みの非公開の行を publishFailed 付きで返す", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        learning_contents: [
          { data: [], error: null },
          { data: { id: 79, title: "クイズ", is_published: false }, error: null },
          { data: null, error: dbError },
        ],
      },
      rpcResults: { replace_quiz_questions: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const result = await createContent({
      title: "クイズ",
      week_id: 3,
      content_type: "quiz",
      insertAfterId: null,
      is_published: true,
      quizQuestions: edited,
    });

    expect(result).toEqual({
      data: { id: 79, title: "クイズ", is_published: false },
      error: null,
      publishFailed: true,
    });
    const builders = vi.mocked(client.from).mock.results.map((r) => r.value);
    expect(builders.some((b) => vi.mocked(b.delete).mock.calls.length > 0)).toBe(false);
  });
});
