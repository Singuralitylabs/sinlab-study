import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");

import { PUT } from "@/app/api/manage/contents/[id]/route";
import { POST } from "@/app/api/manage/contents/route";
import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
import { createContent, updateContent } from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid-maintainer" },
  userId: 1,
  userStatus: "active",
  userRole: "maintainer",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/manage/contents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createContent).mockResolvedValue({ data: { id: 1 } as never, error: null });
  vi.mocked(updateContent).mockResolvedValue({ error: null, storageRemoved: true });
});

describe("POST /api/manage/contents - バリデーション", () => {
  it.each([
    ["title未指定", { week_id: 1, content_type: "video", insert_after_id: null }],
    ["week_id未指定", { title: "コンテンツ1", content_type: "video", insert_after_id: null }],
    ["content_type未指定", { title: "コンテンツ1", week_id: 1, insert_after_id: null }],
    ["insert_after_id未指定", { title: "コンテンツ1", week_id: 1, content_type: "video" }],
  ])("%sの場合は400で、作成処理を呼ばない", async (_label, body) => {
    const res = await POST(request(body) as never);

    expect(res.status).toBe(400);
    expect(createContent).not.toHaveBeenCalled();
  });

  it("content_typeが許可値以外の場合は400（従来はDBのCHECK制約違反で500になっていた）", async () => {
    const res = await POST(
      request({ title: "コンテンツ1", week_id: 1, content_type: "poll" }) as never
    );

    expect(res.status).toBe(400);
    expect(createContent).not.toHaveBeenCalled();
  });

  it("正常な入力は200で、null項目もそのままinsertAfterIdとして渡す", async () => {
    const res = await POST(
      request({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "video",
        description: null,
        insert_after_id: null,
      }) as never
    );

    expect(res.status).toBe(200);
    expect(createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "video",
        description: null,
        insertAfterId: null,
      })
    );
  });

  it("allowed_submission_typesが許可値以外の場合は400", async () => {
    const res = await POST(
      request({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "exercise",
        allowed_submission_types: "email",
        insert_after_id: null,
      }) as never
    );

    expect(res.status).toBe(400);
    expect(createContent).not.toHaveBeenCalled();
  });
});

describe("PUT /api/manage/contents/[id] - バリデーション", () => {
  const params = Promise.resolve({ id: "1" });

  it("空オブジェクトでも200（全項目任意）", async () => {
    const res = await PUT(request({}) as never, { params });

    expect(res.status).toBe(200);
  });

  it("content_typeを指定する場合は許可値以外を受け付けず400", async () => {
    const res = await PUT(request({ content_type: "poll" }) as never, { params });

    expect(res.status).toBe(400);
    expect(updateContent).not.toHaveBeenCalled();
  });

  it("IDが数値でない場合は400", async () => {
    const res = await PUT(request({}) as never, { params: Promise.resolve({ id: "abc" }) });

    expect(res.status).toBe(400);
    expect(updateContent).not.toHaveBeenCalled();
  });

  it("insert_after_idを指定した場合、insertAfterIdとして更新処理へ渡す", async () => {
    const res = await PUT(request({ insert_after_id: null }) as never, { params });

    expect(res.status).toBe(200);
    expect(updateContent).toHaveBeenCalledWith(1, expect.objectContaining({ insertAfterId: null }));
  });

  it("updateContentがInvalidInsertAfterIdErrorを投げた場合は400", async () => {
    vi.mocked(updateContent).mockRejectedValue(new InvalidInsertAfterIdError(999));

    const res = await PUT(request({ insert_after_id: 999 }) as never, { params });

    expect(res.status).toBe(400);
  });
});

describe("POST / PUT /api/manage/contents - クイズの設問（#306）", () => {
  const quizQuestions = [
    {
      question_type: "multiple",
      question: "正しいものを選べ",
      choices: ["a", "b", "c"],
      correct_choices: [2, 0],
      explanation: "解説",
    },
    { question_type: "text", question: "説明せよ", model_answer: "模範解答" },
  ];

  it("作成時は検証・正規化した設問を quizQuestions として渡す", async () => {
    const res = await POST(
      request({
        title: "クイズ",
        week_id: 1,
        content_type: "quiz",
        insert_after_id: null,
        quiz_questions: quizQuestions,
      }) as never
    );

    expect(res.status).toBe(200);
    expect(createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        content_type: "quiz",
        quizQuestions: [
          expect.objectContaining({ correct_choices: [0, 2], model_answer: null, hint: null }),
          expect.objectContaining({ choices: [], correct_choices: [], model_answer: "模範解答" }),
        ],
      })
    );
  });

  it("正解の指定が不正な設問は400で、作成処理を呼ばない", async () => {
    const res = await POST(
      request({
        title: "クイズ",
        week_id: 1,
        content_type: "quiz",
        insert_after_id: null,
        quiz_questions: [{ ...quizQuestions[0], question_type: "single" }],
      }) as never
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "単一選択の設問は正解を1つ選んでください",
    });
    expect(createContent).not.toHaveBeenCalled();
  });

  it("更新時も設問を quizQuestions として渡す", async () => {
    const res = await PUT(
      request({ content_type: "quiz", quiz_questions: quizQuestions }) as never,
      { params: Promise.resolve({ id: "1" }) }
    );

    expect(res.status).toBe(200);
    expect(updateContent).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ quizQuestions: expect.any(Array) })
    );
  });

  it("作成処理が失敗した場合（設問の保存失敗を含む）は500", async () => {
    vi.mocked(createContent).mockResolvedValue({ data: null, error: { message: "x" } as never });

    const res = await POST(
      request({
        title: "クイズ",
        week_id: 1,
        content_type: "quiz",
        insert_after_id: null,
        quiz_questions: quizQuestions,
      }) as never
    );

    expect(res.status).toBe(500);
  });
});
