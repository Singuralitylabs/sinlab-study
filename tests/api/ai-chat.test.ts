import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/api/ai-chat-server");
vi.mock("@/app/services/api/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/api/gemini")>();
  return { ...actual, generateChatReply: vi.fn(), resolveGeminiApiKey: vi.fn() };
});

import { POST } from "@/app/api/ai-chat/route";
import { GET } from "@/app/api/ai-chat/usage/route";
import {
  AI_CHAT_ANSWER_MAX_LENGTH,
  AI_CHAT_HISTORY_MAX_MESSAGES,
  AI_CHAT_MESSAGE_MAX_LENGTH,
} from "@/app/constants/ai-chat";
import {
  claimAIChat,
  completeAIChatUsage,
  failAIChatUsage,
  fetchAIChatUsageSummary,
  fetchLatestSubmissionForChat,
} from "@/app/services/api/ai-chat-server";
import {
  generateChatReply,
  ReviewGenerationError,
  resolveGeminiApiKey,
} from "@/app/services/api/gemini";
import { fetchVisibleContentForChat } from "@/app/services/api/learning-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const limits = { activePerDay: 20, trialLifetime: 5 };

const articleContent = {
  id: 10,
  title: "HTMLの基本",
  content_type: "text",
  text_content: "本文",
  exercise_instructions: null,
  hint: null,
  starter_files: null,
  phaseName: "HTML",
  themeName: "Web開発基礎",
};

const SECRET_QUESTION = "秘密の質問テキスト";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const valid = { contentId: 10, message: SECRET_QUESTION, history: [] };

let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AI_CHAT_ENABLED", "true");
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(resolveGeminiApiKey).mockReturnValue("test-key");
  vi.mocked(createServerSupabaseClient).mockResolvedValue(createMockSupabaseClient() as never);
  vi.mocked(fetchVisibleContentForChat).mockResolvedValue(articleContent as never);
  vi.mocked(fetchLatestSubmissionForChat).mockResolvedValue({ submission: null, review: null });
  vi.mocked(claimAIChat).mockResolvedValue({ kind: "claimed", usageId: 7, remaining: 19, limits });
  vi.mocked(generateChatReply).mockResolvedValue({
    answer: "シンラビだよ。回答です",
    modelUsed: "gemini-test",
    promptTokens: 100,
    completionTokens: 20,
    thoughtsTokens: 5,
  });
  vi.mocked(completeAIChatUsage).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function expectNoTextInLogs() {
  for (const spy of [errorSpy, logSpy, warnSpy]) {
    for (const call of spy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SECRET_QUESTION);
      expect(JSON.stringify(call)).not.toContain("test-key");
    }
  }
}

describe("POST /api/ai-chat - 有効・無効と認可", () => {
  it("AI_CHAT_ENABLED が true 以外なら 503 で何もしない", async () => {
    vi.stubEnv("AI_CHAT_ENABLED", "1");
    const res = await post(valid);
    expect(res.status).toBe(503);
    expect(getServerAuth).not.toHaveBeenCalled();
    expect(claimAIChat).not.toHaveBeenCalled();
  });

  it("未認証は 401", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);
    expect((await post(valid)).status).toBe(401);
  });

  it("rejected は 403", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userStatus: "rejected" } as never);
    expect((await post(valid)).status).toBe(403);
    expect(claimAIChat).not.toHaveBeenCalled();
  });

  it("お試しでも有料ティアのキーを使う", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userStatus: "trial" } as never);
    await post(valid);
    expect(resolveGeminiApiKey).toHaveBeenCalledWith("active");
    expect(resolveGeminiApiKey).not.toHaveBeenCalledWith("trial");
  });

  it("キーが無いと 503", async () => {
    vi.mocked(resolveGeminiApiKey).mockReturnValue(undefined);
    expect((await post(valid)).status).toBe(503);
  });

  it("見られないコンテンツは 403 で枠を確保しない", async () => {
    vi.mocked(fetchVisibleContentForChat).mockResolvedValue(null);
    expect((await post(valid)).status).toBe(403);
    expect(claimAIChat).not.toHaveBeenCalled();
  });

  it.each(["video", "slide", "quiz"])("%s のコンテンツは 400", async (type) => {
    vi.mocked(fetchVisibleContentForChat).mockResolvedValue({
      ...articleContent,
      content_type: type,
    } as never);
    expect((await post(valid)).status).toBe(400);
    expect(claimAIChat).not.toHaveBeenCalled();
  });

  it("service_role のクライアントを作らない（文脈は通常クライアントで取る）", async () => {
    await post(valid);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai-chat - 入力の検証", () => {
  it(`質問が ${AI_CHAT_MESSAGE_MAX_LENGTH} 文字を超えると 400`, async () => {
    const res = await post({ ...valid, message: "あ".repeat(AI_CHAT_MESSAGE_MAX_LENGTH + 1) });
    expect(res.status).toBe(400);
    expect(getServerAuth).not.toHaveBeenCalled();
  });

  it("空白だけの質問は 400", async () => {
    expect((await post({ ...valid, message: "   " })).status).toBe(400);
  });

  it(`履歴が ${AI_CHAT_HISTORY_MAX_MESSAGES} 件を超えると 400`, async () => {
    const history = Array.from({ length: AI_CHAT_HISTORY_MAX_MESSAGES + 1 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "x",
    }));
    expect((await post({ ...valid, history })).status).toBe(400);
  });

  it(`履歴の回答が ${AI_CHAT_ANSWER_MAX_LENGTH} 文字を超えると 400`, async () => {
    const history = [
      { role: "user", content: "q" },
      { role: "assistant", content: "a".repeat(AI_CHAT_ANSWER_MAX_LENGTH + 1) },
    ];
    expect((await post({ ...valid, history })).status).toBe(400);
  });

  it("履歴の role が不正なら 400", async () => {
    expect((await post({ ...valid, history: [{ role: "system", content: "x" }] })).status).toBe(
      400
    );
  });
});

describe("POST /api/ai-chat - 回数制限と Gemini", () => {
  it("回答を返し、トークン数とモデル名を記録する（本文は記録しない）", async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      answer: "シンラビだよ。回答です",
      remaining: 19,
      limit: 20,
    });
    expect(completeAIChatUsage).toHaveBeenCalledWith(7, {
      modelUsed: "gemini-test",
      promptTokens: 100,
      completionTokens: 20,
      thoughtsTokens: 5,
    });
    expect(JSON.stringify(vi.mocked(completeAIChatUsage).mock.calls)).not.toContain("回答です");
    expectNoTextInLogs();
  });

  it("上限なら 429 と理由・リセット時刻を返し、Gemini を呼ばない", async () => {
    vi.mocked(claimAIChat).mockResolvedValue({ kind: "limited", reason: "user_daily", limits });
    const res = await post(valid);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.reason).toBe("user_daily");
    expect(body.remaining).toBe(0);
    expect(typeof body.resetsAt).toBe("string");
    expect(generateChatReply).not.toHaveBeenCalled();
  });

  it("お試しの上限は resetsAt が null", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userStatus: "trial" } as never);
    vi.mocked(claimAIChat).mockResolvedValue({ kind: "limited", reason: "trial_lifetime", limits });
    const body = await (await post(valid)).json();
    expect(body.reason).toBe("trial_lifetime");
    expect(body.resetsAt).toBeNull();
  });

  it("Gemini が失敗したら行を failed にして（回数を戻して）502", async () => {
    const usage = { promptTokens: 50, completionTokens: null, thoughtsTokens: null };
    vi.mocked(generateChatReply).mockRejectedValue(new ReviewGenerationError("x", usage));
    const res = await post(valid);
    expect(res.status).toBe(502);
    expect(failAIChatUsage).toHaveBeenCalledWith(7, usage);
    expect(completeAIChatUsage).not.toHaveBeenCalled();
    expectNoTextInLogs();
  });

  it("前の質問の回答待ちなら 409 で Gemini を呼ばない", async () => {
    vi.mocked(claimAIChat).mockResolvedValue({ kind: "busy" });
    expect((await post(valid)).status).toBe(409);
    expect(generateChatReply).not.toHaveBeenCalled();
  });

  it("枠の確保に失敗したら 500 で Gemini を呼ばない", async () => {
    vi.mocked(claimAIChat).mockResolvedValue(null);
    expect((await post(valid)).status).toBe(500);
    expect(generateChatReply).not.toHaveBeenCalled();
  });

  it("長すぎる回答は上限文字数で切る", async () => {
    vi.mocked(generateChatReply).mockResolvedValue({
      answer: "あ".repeat(AI_CHAT_ANSWER_MAX_LENGTH + 100),
      modelUsed: "m",
      promptTokens: 1,
      completionTokens: 1,
      thoughtsTokens: 1,
    });
    const body = await (await post(valid)).json();
    expect(body.answer.length).toBe(AI_CHAT_ANSWER_MAX_LENGTH);
  });

  it("演習では本人の最新の提出を通常クライアントで取り、プロンプトに入れる", async () => {
    vi.mocked(fetchVisibleContentForChat).mockResolvedValue({
      ...articleContent,
      content_type: "exercise",
      text_content: null,
      exercise_instructions: "ボタンを置く",
    } as never);
    vi.mocked(fetchLatestSubmissionForChat).mockResolvedValue({
      submission: { type: "code", files: [{ filename: "", language: "", content: "<p>x</p>" }] },
      review: null,
    });
    await post(valid);
    expect(fetchLatestSubmissionForChat).toHaveBeenCalledWith(expect.anything(), 2, 10);
    const { contents } = vi.mocked(generateChatReply).mock.calls[0][0];
    expect(contents).toContain("<p>x</p>");
    expect(contents).toContain("ボタンを置く");
  });

  it("記事では提出を取りに行かない", async () => {
    await post(valid);
    expect(fetchLatestSubmissionForChat).not.toHaveBeenCalled();
  });
});

describe("GET /api/ai-chat/usage", () => {
  it("無効なら 503", async () => {
    vi.stubEnv("AI_CHAT_ENABLED", "false");
    expect((await GET()).status).toBe(503);
  });

  it("残り回数を返す", async () => {
    const usage = {
      remaining: 18,
      limit: 20,
      period: "daily" as const,
      resetsAt: "2026-11-17T15:00:00.000Z",
    };
    vi.mocked(fetchAIChatUsageSummary).mockResolvedValue({ data: usage, error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ usage });
    expect(fetchAIChatUsageSummary).toHaveBeenCalledWith(
      expect.anything(),
      2,
      "active",
      expect.any(Date)
    );
  });
});
