import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GEMINI_API_KEY_ENV,
  GEMINI_API_KEY_TRIAL_ENV,
  GEMINI_MAX_CODE_LENGTH,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_MAX_RETRIES,
  GEMINI_MODEL_NAME,
  GEMINI_REQUEST_TIMEOUT_MS,
  GEMINI_RETRY_BASE_DELAY_MS,
  GEMINI_THINKING_LEVEL,
} from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";

const { generateContentMock, GoogleGenAIMock } = vi.hoisted(() => {
  const generateContentMock = vi.fn();
  const GoogleGenAIMock = vi.fn(function GoogleGenAI() {
    return { models: { generateContent: generateContentMock } };
  });
  return { generateContentMock, GoogleGenAIMock };
});

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: GoogleGenAIMock,
  };
});

import {
  buildUserPrompt,
  extractOverallScore,
  generateReview,
  isRateLimitError,
  isTimeoutError,
  redactApiKey,
  resolveGeminiApiKey,
  SYSTEM_PROMPT,
} from "@/app/services/api/gemini";

const MEMBER_KEY = "member-api-key";
const TRIAL_KEY = "trial-api-key";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(GEMINI_API_KEY_ENV, "");
  vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("resolveGeminiApiKey", () => {
  it("active は会員用キーを返す（コミュニティ/一般有料の差はない）", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, TRIAL_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.ACTIVE)).toBe(MEMBER_KEY);
  });

  it("active で会員用キーのみでもそのキーを返す", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.ACTIVE)).toBe(MEMBER_KEY);
  });

  it("active で会員用キー未設定ならお試し用キーがあっても undefined", () => {
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, TRIAL_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.ACTIVE)).toBeUndefined();
  });

  it("pending はお試し用キーを返す", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, TRIAL_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.PENDING)).toBe(TRIAL_KEY);
  });

  it("pending でお試し用キー未設定なら会員用キーにフォールバックする", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.PENDING)).toBe(MEMBER_KEY);
  });

  it("pending でお試し用キーが空文字なら会員用キーにフォールバックする", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, "");

    expect(resolveGeminiApiKey(USER_STATUS.PENDING)).toBe(MEMBER_KEY);
  });

  it("pending でお試し用キーのみならそのキーを返す", () => {
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, TRIAL_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.PENDING)).toBe(TRIAL_KEY);
  });

  it("pending で両方未設定なら undefined", () => {
    expect(resolveGeminiApiKey(USER_STATUS.PENDING)).toBeUndefined();
  });

  it("rejected / null はキーを返さない", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, TRIAL_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.REJECTED)).toBeUndefined();
    expect(resolveGeminiApiKey(null)).toBeUndefined();
  });
});

describe("extractOverallScore", () => {
  it("総合スコア: XX/100 を抽出する", () => {
    expect(extractOverallScore("総合スコア: 85/100")).toBe(85);
  });

  it("空白や強調記法があっても抽出する", () => {
    expect(extractOverallScore("**総合スコア: 70 / 100**")).toBe(70);
  });

  it("0点も抽出する", () => {
    expect(extractOverallScore("総合スコア: 0/100")).toBe(0);
  });

  it("該当行がなければ null", () => {
    expect(extractOverallScore("スコアはありません")).toBeNull();
  });
});

describe("isRateLimitError", () => {
  it("ApiError の status が 429 なら true", () => {
    expect(isRateLimitError(new ApiError({ message: "quota", status: 429 }))).toBe(true);
  });

  it("ApiError でも 429 以外は false", () => {
    expect(isRateLimitError(new ApiError({ message: "server", status: 500 }))).toBe(false);
  });

  it("メッセージに 429 を含む通常の Error は false（型ベース判定）", () => {
    expect(isRateLimitError(new Error("429 Too Many Requests"))).toBe(false);
  });

  it("Error 以外は false", () => {
    expect(isRateLimitError({ status: 429 })).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe("isTimeoutError", () => {
  it("DOMException(AbortError) は true（SDK内部のAbortControllerがreasonなしでabortするため）", () => {
    expect(isTimeoutError(new DOMException("The operation was aborted.", "AbortError"))).toBe(true);
  });

  it("名前が異なる DOMException や通常の Error は false", () => {
    expect(isTimeoutError(new DOMException("timed out", "TimeoutError"))).toBe(false);
    expect(isTimeoutError(new Error("timeout"))).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});

describe("buildUserPrompt", () => {
  it("URL提出のプロンプトを組み立てる", () => {
    const prompt = buildUserPrompt("フォームを作る", {
      type: "url",
      content: "https://example.com/work",
    });

    expect(prompt).toContain("## 課題内容\nフォームを作る");
    expect(prompt).toContain("## 提出内容（URL）\nhttps://example.com/work");
    expect(prompt).toContain("URL提出のため");
    expect(prompt).not.toContain("## 模範回答");
  });

  it("模範回答がある場合はセクションを挿入する", () => {
    const prompt = buildUserPrompt(
      "課題",
      { type: "url", content: "https://example.com" },
      "これが模範"
    );

    expect(prompt).toContain("## 模範回答\nこれが模範");
  });

  it("単一ファイル（ファイル名なし）はコードフェンスのみ", () => {
    const prompt = buildUserPrompt("課題", {
      type: "code",
      files: [{ filename: "", language: "", content: "const x = 1;" }],
    });

    expect(prompt).toContain("## 提出コード\n```\nconst x = 1;\n```");
  });

  it("単一ファイル（ファイル名なし）は上限を超えた分を省略する", () => {
    const content = "a".repeat(GEMINI_MAX_CODE_LENGTH + 12);
    const prompt = buildUserPrompt("課題", {
      type: "code",
      files: [{ filename: "", language: "", content }],
    });

    expect(prompt).toContain("a".repeat(GEMINI_MAX_CODE_LENGTH));
    expect(prompt).toContain(`... (12文字省略)`);
    expect(prompt).not.toContain(content);
  });

  it("複数ファイルはファイル名・言語付きで並べる", () => {
    const prompt = buildUserPrompt("課題", {
      type: "code",
      files: [
        { filename: "コード.gs", language: "javascript", content: "function main() {}" },
        { filename: "index.html", language: "html", content: "<p>hi</p>" },
      ],
    });

    expect(prompt).toContain("### コード.gs (javascript)\n```\nfunction main() {}\n```");
    expect(prompt).toContain("### index.html (html)\n```\n<p>hi</p>\n```");
  });
});

describe("redactApiKey", () => {
  it("メッセージ中の API キーを伏せる", () => {
    expect(redactApiKey(`invalid ${MEMBER_KEY} key`, MEMBER_KEY)).toBe("invalid [redacted] key");
  });

  it("キーを含まない場合はそのまま返す", () => {
    expect(redactApiKey("no secret", MEMBER_KEY)).toBe("no secret");
  });
});

describe("generateReview", () => {
  const baseParams = {
    exerciseInstructions: "ログイン画面を作る",
    submission: { type: "url" as const, content: "https://example.com/login" },
    referenceAnswer: null,
    apiKey: MEMBER_KEY,
  };

  it("渡したキーで SDK を初期化し、モデル設定とトークン数・スコアを返す", async () => {
    generateContentMock.mockResolvedValue({
      text: "良いです。\n総合スコア: 88/100",
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40 },
    });

    const result = await generateReview(baseParams);

    expect(GoogleGenAIMock).toHaveBeenCalledWith({ apiKey: MEMBER_KEY });
    expect(generateContentMock).toHaveBeenCalledWith({
      model: GEMINI_MODEL_NAME,
      contents: buildUserPrompt(
        baseParams.exerciseInstructions,
        baseParams.submission,
        baseParams.referenceAnswer
      ),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL },
        abortSignal: expect.any(AbortSignal),
      },
    });
    expect(result).toEqual({
      reviewContent: "良いです。\n総合スコア: 88/100",
      overallScore: 88,
      modelUsed: GEMINI_MODEL_NAME,
      promptTokens: 120,
      completionTokens: 40,
    });
    expect(JSON.stringify(result)).not.toContain(MEMBER_KEY);
  });

  it("usageMetadata が無い場合はトークン数を null にする", async () => {
    generateContentMock.mockResolvedValue({ text: "総合スコア: 10/100" });

    const result = await generateReview(baseParams);

    expect(result.promptTokens).toBeNull();
    expect(result.completionTokens).toBeNull();
  });

  it("429 は指数バックオフで最大2回リトライする", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const rateLimitError = new ApiError({ message: "Too Many Requests", status: 429 });
    generateContentMock
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        text: "総合スコア: 60/100",
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
      });

    const resultPromise = generateReview(baseParams);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(generateContentMock).toHaveBeenCalledTimes(GEMINI_MAX_RETRIES + 1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), GEMINI_RETRY_BASE_DELAY_MS);
    expect(setTimeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      GEMINI_RETRY_BASE_DELAY_MS * 2
    );
    expect(result.overallScore).toBe(60);
  });

  it("429 がリトライ上限を超えたら日本語の上限メッセージを投げる", async () => {
    vi.useFakeTimers();
    const rateLimitError = new ApiError({ message: "Too Many Requests", status: 429 });
    generateContentMock.mockRejectedValue(rateLimitError);

    const resultPromise = generateReview(baseParams);
    const assertion = expect(resultPromise).rejects.toThrow(
      "Gemini APIの利用上限に達しました。しばらく時間を置いてから再試行してください。"
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(generateContentMock).toHaveBeenCalledTimes(GEMINI_MAX_RETRIES + 1);
  });

  it("429 以外のエラーはリトライせず、メッセージからキーを除去して投げる", async () => {
    generateContentMock.mockRejectedValue(new Error(`invalid API key ${MEMBER_KEY}`));

    await expect(generateReview(baseParams)).rejects.toThrow("invalid API key [redacted]");
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("GEMINI_REQUEST_TIMEOUT_MS でリクエストごとのタイムアウトを設定する", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    generateContentMock.mockResolvedValue({ text: "総合スコア: 50/100" });

    await generateReview(baseParams);

    expect(timeoutSpy).toHaveBeenCalledWith(GEMINI_REQUEST_TIMEOUT_MS);
  });

  it("応答がタイムアウトした場合は日本語のタイムアウトメッセージを投げ、リトライしない", async () => {
    // SDK内部のAbortControllerがreasonなしでabortするため、実際に投げられるのは
    // DOMException "AbortError"（"TimeoutError"ではない）
    const timeoutError = new DOMException("The operation was aborted.", "AbortError");
    generateContentMock.mockRejectedValue(timeoutError);

    await expect(generateReview(baseParams)).rejects.toThrow(
      "Gemini APIの応答がタイムアウトしました。しばらく時間を置いてから再試行してください。"
    );
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("apiKey が空なら SDK を呼ばない", async () => {
    await expect(generateReview({ ...baseParams, apiKey: "" })).rejects.toThrow(
      "Gemini APIキーが設定されていません"
    );
    expect(GoogleGenAIMock).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "",
    "   ",
  ])("本文が空（%j）なら例外を投げ、completed にしない", async (text) => {
    generateContentMock.mockResolvedValue({ text });

    await expect(generateReview(baseParams)).rejects.toThrow(
      "Gemini APIからレビュー結果を取得できませんでした"
    );
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });
});
