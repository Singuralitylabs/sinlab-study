import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");

import { PATCH, POST } from "@/app/api/manage/contents/bulk/route";
import { bulkUpdateContents, createContentsAtTail } from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid-maintainer" },
  userId: 1,
  userStatus: "active",
  userRole: "maintainer",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/manage/contents/bulk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(bulkUpdateContents).mockResolvedValue({
    error: null,
    updated: 3,
    storageRemoved: true,
  });
});

describe("PATCH /api/manage/contents/bulk - 認可", () => {
  it("未認証は401で、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(401);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("userIdなしは403で、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "auth-uuid" },
      userId: null,
      userStatus: "active",
      userRole: "maintainer",
    } as never);

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(403);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("rejectedユーザーは403で、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...maintainerAuth,
      userStatus: "rejected",
    } as never);

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(403);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("コンテンツ管理権限のないロール（member）は403で、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...maintainerAuth,
      userRole: "member",
    } as never);

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(403);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/manage/contents/bulk - バリデーション", () => {
  it("リクエストボディが不正なJSON（パース不能）の場合は500ではなく400", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/manage/contents/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      })
    );

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("リクエストボディがnullの場合は400", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/manage/contents/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "null",
      })
    );

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("idsが空配列の場合は400", async () => {
    const res = await PATCH(request({ ids: [], action: "publish" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("idsに0以下・小数など不正な値を含む場合は400", async () => {
    const res = await PATCH(request({ ids: [1, -1], action: "publish" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("idsが100件を超える場合は400", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);

    const res = await PATCH(request({ ids, action: "publish" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("idsがちょうど100件の場合は許可される", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);

    const res = await PATCH(request({ ids, action: "publish" }));

    expect(res.status).toBe(200);
    expect(bulkUpdateContents).toHaveBeenCalledWith(ids, { is_published: true });
  });

  it("actionがホワイトリスト外の場合は400", async () => {
    const res = await PATCH(request({ ids: [1], action: "archive" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("set_typeでcontentTypeが未指定の場合は400", async () => {
    const res = await PATCH(request({ ids: [1], action: "set_type" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("set_typeでcontentTypeが不正な値の場合は400", async () => {
    const res = await PATCH(request({ ids: [1], action: "set_type", contentType: "poll" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/manage/contents/bulk - set_type で quiz は不可（#306）", () => {
  it("設問のないクイズを作らないよう、set_type で quiz を指定したら400", async () => {
    const res = await PATCH(request({ ids: [1], action: "set_type", contentType: "quiz" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "クイズへの変更は編集画面で設問と一緒に行ってください",
    });
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/manage/contents/bulk - action→patchマッピング", () => {
  it.each([
    ["publish", { is_published: true }],
    ["unpublish", { is_published: false }],
    ["open_trial", { is_open_to_trial: true }],
    ["close_trial", { is_open_to_trial: false }],
    ["delete", { is_deleted: true }],
  ] as const)("%s は %o を渡す", async (action, expectedPatch) => {
    const res = await PATCH(request({ ids: [1, 2, 3], action }));

    expect(res.status).toBe(200);
    expect(bulkUpdateContents).toHaveBeenCalledWith([1, 2, 3], expectedPatch);
    await expect(res.json()).resolves.toEqual({ success: true, updated: 3, storageRemoved: true });
  });

  it("set_typeはcontentTypeをcontent_typeとして渡す", async () => {
    const res = await PATCH(request({ ids: [1, 2], action: "set_type", contentType: "exercise" }));

    expect(res.status).toBe(200);
    expect(bulkUpdateContents).toHaveBeenCalledWith([1, 2], { content_type: "exercise" });
  });
});

describe("PATCH /api/manage/contents/bulk - 更新失敗", () => {
  it("bulkUpdateContentsがエラーを返した場合は500", async () => {
    vi.mocked(bulkUpdateContents).mockResolvedValue({
      error: { message: "db error", code: "PGRST204" } as never,
      updated: 0,
      storageRemoved: true,
    });

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(500);
  });
});

describe("POST /api/manage/contents/bulk - 一括登録（#306）", () => {
  const post = (body: unknown) =>
    new Request("http://localhost/api/manage/contents/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const quiz = {
    title: "クイズ1",
    week_id: 3,
    content_type: "quiz",
    quiz_questions: [
      { question_type: "single", question: "Q", choices: ["a", "b"], correct_choices: [1] },
    ],
  };

  beforeEach(() => {
    vi.mocked(createContentsAtTail).mockResolvedValue({
      created: [{ id: 10, title: "クイズ1" }],
      error: null,
      failedIndex: null,
    });
  });

  it("設問付きのクイズを含む複数件を順に作成し、作成結果を返す", async () => {
    const res = await POST(
      post({ contents: [quiz, { title: "動画", week_id: 3, content_type: "video" }] })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      created: [{ id: 10, title: "クイズ1" }],
    });
    expect(createContentsAtTail).toHaveBeenCalledWith([
      expect.objectContaining({
        content_type: "quiz",
        quizQuestions: [expect.objectContaining({ correct_choices: [1] })],
      }),
      expect.objectContaining({ content_type: "video", quizQuestions: undefined }),
    ]);
  });

  it("1件でも不正な設問があれば400で、1件も作成しない", async () => {
    const res = await POST(
      post({
        contents: [
          { title: "OK", week_id: 3, content_type: "video" },
          { ...quiz, quiz_questions: [{ ...quiz.quiz_questions[0], correct_choices: [] }] },
        ],
      })
    );

    expect(res.status).toBe(400);
    expect(createContentsAtTail).not.toHaveBeenCalled();
  });

  it("設問のないクイズは400", async () => {
    const res = await POST(post({ contents: [{ ...quiz, quiz_questions: undefined }] }));

    expect(res.status).toBe(400);
    expect(createContentsAtTail).not.toHaveBeenCalled();
  });

  it("空配列は400", async () => {
    const res = await POST(post({ contents: [] }));

    expect(res.status).toBe(400);
  });

  it("途中で失敗したら500で、作成済みの件を返す", async () => {
    vi.mocked(createContentsAtTail).mockResolvedValue({
      created: [{ id: 10, title: "クイズ1" }],
      error: { message: "x" } as never,
      failedIndex: 1,
    });

    const res = await POST(post({ contents: [quiz, quiz] }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "2件目のコンテンツの作成に失敗しました（それより前の1件は作成済み）",
      created: [{ id: 10, title: "クイズ1" }],
    });
  });

  it("コンテンツ管理権限がなければ403で、作成しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...maintainerAuth, userRole: "member" } as never);

    const res = await POST(post({ contents: [quiz] }));

    expect(res.status).toBe(403);
    expect(createContentsAtTail).not.toHaveBeenCalled();
  });
});
