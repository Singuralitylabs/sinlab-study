import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/quiz-server");

import { POST } from "@/app/api/quiz/grade/route";
import { isContentVisible } from "@/app/services/api/learning-server";
import { gradeQuizAnswers } from "@/app/services/api/quiz-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const body = {
  contentId: 5,
  answers: [
    { questionId: 1, choices: [1] },
    { questionId: 2, text: "回答" },
  ],
};

const request = (payload: unknown = body) =>
  new Request("http://localhost/api/quiz/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

const results = [
  {
    questionId: 1,
    questionType: "single",
    isCorrect: true,
    correctChoices: [1],
    modelAnswer: null,
    explanation: "解説",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
  vi.mocked(isContentVisible).mockResolvedValue(true);
  vi.mocked(gradeQuizAnswers).mockResolvedValue({ data: results as never, error: null });
});

describe("POST /api/quiz/grade", () => {
  it("未認証は401で、採点しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(401);
    expect(gradeQuizAnswers).not.toHaveBeenCalled();
  });

  it("rejected は403で、採点しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userStatus: "rejected" } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    expect(gradeQuizAnswers).not.toHaveBeenCalled();
  });

  it("見えないコンテンツ（未公開・お試し対象外）は403で、採点しない", async () => {
    vi.mocked(isContentVisible).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    expect(gradeQuizAnswers).not.toHaveBeenCalled();
  });

  it("admin / maintainer は未公開プレビューのため可視性チェックを通さずに採点できる", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userRole: "maintainer" } as never);
    vi.mocked(isContentVisible).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(isContentVisible).not.toHaveBeenCalled();
  });

  it("正常系は設問ごとの採点結果を返す", async () => {
    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ results });
    expect(gradeQuizAnswers).toHaveBeenCalledWith(expect.anything(), 5, body.answers);
  });

  it("採点結果が空（未回答の設問がある）なら400で、正解は返さない", async () => {
    vi.mocked(gradeQuizAnswers).mockResolvedValue({ data: [], error: null });

    const res = await POST(request() as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "すべての設問に回答してください" });
  });

  it("RPC エラーは500", async () => {
    vi.mocked(gradeQuizAnswers).mockResolvedValue({ data: [], error: { message: "x" } as never });

    const res = await POST(request() as never);

    expect(res.status).toBe(500);
  });

  it.each([
    ["contentId 不正", { ...body, contentId: "5" }],
    ["answers 空", { ...body, answers: [] }],
    ["選択肢が負の数", { ...body, answers: [{ questionId: 1, choices: [-1] }] }],
    ["回答が長すぎる", { ...body, answers: [{ questionId: 2, text: "a".repeat(2001) }] }],
  ])("%sは400で、採点しない", async (_label, payload) => {
    const res = await POST(request(payload) as never);

    expect(res.status).toBe(400);
    expect(gradeQuizAnswers).not.toHaveBeenCalled();
  });
});
