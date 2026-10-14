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
  GEMINI_RETRY_MIN_ATTEMPT_MS,
  GEMINI_TEMPERATURE,
  GEMINI_THINKING_LEVEL,
  GEMINI_TOTAL_BUDGET_MS,
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
  buildRubricDraftPrompt,
  buildUserPrompt,
  generateGradingRubricDraft,
  generateReview,
  isRateLimitError,
  isRetryableError,
  isTimeoutError,
  parseReviewResponse,
  ReviewGenerationError,
  RUBRIC_DRAFT_SYSTEM_PROMPT,
  redactApiKey,
  resolveGeminiApiKey,
  SYSTEM_PROMPT,
  toUserFacingErrorMessage,
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

  it("trial はお試し用キーを返す", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, TRIAL_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.TRIAL)).toBe(TRIAL_KEY);
  });

  it("trial でお試し用キー未設定なら会員用キーにフォールバックする", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.TRIAL)).toBe(MEMBER_KEY);
  });

  it("trial でお試し用キーが空文字なら会員用キーにフォールバックする", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, "");

    expect(resolveGeminiApiKey(USER_STATUS.TRIAL)).toBe(MEMBER_KEY);
  });

  it("trial でお試し用キーのみならそのキーを返す", () => {
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, TRIAL_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.TRIAL)).toBe(TRIAL_KEY);
  });

  it("trial で両方未設定なら undefined", () => {
    expect(resolveGeminiApiKey(USER_STATUS.TRIAL)).toBeUndefined();
  });

  it("rejected / null はキーを返さない", () => {
    vi.stubEnv(GEMINI_API_KEY_ENV, MEMBER_KEY);
    vi.stubEnv(GEMINI_API_KEY_TRIAL_ENV, TRIAL_KEY);

    expect(resolveGeminiApiKey(USER_STATUS.REJECTED)).toBeUndefined();
    expect(resolveGeminiApiKey(null)).toBeUndefined();
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

describe("isRetryableError", () => {
  it.each([429, 500, 503])("ApiError の status が %i なら true（一時的なエラー）", (status) => {
    expect(isRetryableError(new ApiError({ message: "transient", status }))).toBe(true);
  });

  it.each([400, 401, 403, 404, 504])("ApiError でも %i は false（恒久的なエラー）", (status) => {
    expect(isRetryableError(new ApiError({ message: "permanent", status }))).toBe(false);
  });

  it("ApiError 以外は false（型ベース判定）", () => {
    expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(false);
    expect(isRetryableError({ status: 503 })).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});

describe("toUserFacingErrorMessage", () => {
  const rawBody = JSON.stringify({
    error: {
      code: 503,
      message: "This model is currently experiencing high demand.",
      status: "UNAVAILABLE",
    },
  });

  it("503 / 500 は混雑の案内にし、API応答の生JSONを含めない", () => {
    for (const status of [500, 503]) {
      const message = toUserFacingErrorMessage(new ApiError({ message: rawBody, status }));
      expect(message).toBe("AIが混み合っています。しばらく時間を置いてから再試行してください。");
      expect(message).not.toContain("{");
    }
  });

  it("400 などの ApiError もステータスコードのみを示し、生JSON・キーを含めない", () => {
    const message = toUserFacingErrorMessage(
      new ApiError({
        message: `{"error":{"code":400,"message":"bad ${MEMBER_KEY}"}}`,
        status: 400,
      })
    );
    expect(message).toBe("AIレビューの生成中にエラーが発生しました（コード: 400）。");
  });

  it("ApiError でないエラー（ネットワーク断など）も固定の日本語文言にし、元のメッセージを含めない", () => {
    for (const error of [new TypeError("fetch failed"), new Error("ECONNRESET"), "boom", null]) {
      expect(toUserFacingErrorMessage(error)).toBe(
        "AIレビューの生成中にエラーが発生しました。しばらく時間を置いてから再試行してください。"
      );
    }
  });
});

describe("isTimeoutError", () => {
  it("DOMException(AbortError) は true（SDK内部のAbortControllerがreasonなしでabortするため）", () => {
    expect(isTimeoutError(new DOMException("The operation was aborted.", "AbortError"))).toBe(true);
  });

  it("DOMException(TimeoutError) も true（SDKがreason付きでabortするようになった場合の保険）", () => {
    expect(isTimeoutError(new DOMException("timed out", "TimeoutError"))).toBe(true);
  });

  it("名前が異なる DOMException や通常の Error は false", () => {
    expect(isTimeoutError(new DOMException("aborted", "SyntaxError"))).toBe(false);
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

  it("単一ファイル（ファイル名なし）に言語があればコードフェンスに付ける", () => {
    const prompt = buildUserPrompt("課題", {
      type: "code",
      files: [{ filename: "", language: "sql", content: "SELECT 1;" }],
    });

    expect(prompt).toContain("## 提出コード\n```sql\nSELECT 1;\n```");
  });

  it("単一ファイルの gas は Markdown で通じる javascript としてフェンスに付ける", () => {
    const prompt = buildUserPrompt("課題", {
      type: "code",
      files: [{ filename: "", language: "gas", content: "function main() {}" }],
    });

    expect(prompt).toContain("## 提出コード\n```javascript\nfunction main() {}\n```");
  });

  it("単一ファイルの言語が既知の値でなければコードフェンスに付けない（フェンスを壊さない）", () => {
    const prompt = buildUserPrompt("課題", {
      type: "code",
      files: [{ filename: "", language: "sql\n```", content: "SELECT 1;" }],
    });

    expect(prompt).toContain("## 提出コード\n```\nSELECT 1;\n```");
  });

  it("コード中のバッククォートより長いフェンスで囲み、提出内容でフェンスが閉じないようにする", () => {
    const readme = "# 手順\n```bash\nnpm install\n```\n以降の文";
    const single = buildUserPrompt("課題", {
      type: "code",
      files: [{ filename: "", language: "markdown", content: readme }],
    });
    expect(single).toContain(`## 提出コード\n\`\`\`\`markdown\n${readme}\n\`\`\`\``);

    const multi = buildUserPrompt("課題", {
      type: "code",
      files: [
        { filename: "README.md", language: "markdown", content: "````js\nx\n````" },
        { filename: "main.js", language: "javascript", content: "const a = 1;" },
      ],
    });
    expect(multi).toContain("### README.md (markdown)\n`````\n````js\nx\n````\n`````");
    expect(multi).toContain("### main.js (javascript)\n```\nconst a = 1;\n```");
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

  it("複数ファイルもファイルごとに上限を超えた分を省略する", () => {
    const long = "b".repeat(GEMINI_MAX_CODE_LENGTH + 5);
    const prompt = buildUserPrompt("課題", {
      type: "code",
      files: [
        { filename: "README.md", language: "markdown", content: long },
        { filename: "main.js", language: "javascript", content: "const a = 1;" },
      ],
    });

    expect(prompt).toContain(`${"b".repeat(GEMINI_MAX_CODE_LENGTH)}\n\n... (5文字省略)`);
    expect(prompt).not.toContain(long);
    expect(prompt).toContain("### main.js (javascript)\n```\nconst a = 1;\n```");
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

const RUBRIC = {
  version: 3,
  requirements: [
    { key: "r1", name: "フォームがある", description: "入力欄と送信ボタン" },
    { key: "r2", name: "検証する", description: "" },
  ],
};

const CODE_SUBMISSION = {
  type: "code" as const,
  files: [{ filename: "", language: "", content: "const x = 1;" }],
};

function rubricResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    requirements: [
      { key: "r1", status: "met", comment: "ok" },
      { key: "r2", status: "partial", comment: "一部" },
    ],
    code_quality: { level: "good", comment: "読みやすい" },
    suggestions: ["a"],
    advice: "次へ",
    ...overrides,
  });
}

describe("buildUserPrompt (採点基準)", () => {
  it("採点基準がある場合は key と名前を列挙し、AI に key の変更を禁じる", () => {
    const prompt = buildUserPrompt("課題", CODE_SUBMISSION, null, RUBRIC);

    expect(prompt).toContain("## 採点基準（要件）");
    expect(prompt).toContain("key: r1 / 名前: フォームがある / 説明: 入力欄と送信ボタン");
    expect(prompt).toContain("key: r2 / 名前: 検証する");
    expect(prompt).not.toContain("名前: 検証する / 説明");
    expect(prompt).toContain("key を追加・変更・省略しないでください");
  });

  it("採点基準がないコード提出は要件の推測を指示する", () => {
    const prompt = buildUserPrompt("課題", CODE_SUBMISSION);

    expect(prompt).toContain("採点基準は未設定です");
    expect(prompt).not.toContain("## 採点基準（要件）");
  });

  it("URL 提出には採点基準セクションを入れない", () => {
    const prompt = buildUserPrompt("課題", { type: "url", content: "https://e.com" }, null, RUBRIC);

    expect(prompt).not.toContain("採点基準");
  });
});

describe("parseReviewResponse", () => {
  it("rubric: 名前は採点基準から補い、基準の並び順に揃える", () => {
    const text = rubricResponse({
      requirements: [
        { key: "r2", status: "unmet", comment: "x" },
        { key: "r1", status: "met", comment: "y" },
      ],
    });

    const result = parseReviewResponse(text, "rubric", RUBRIC);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reviewJson.requirements.map((r) => [r.key, r.name, r.status])).toEqual([
        ["r1", "フォームがある", "met"],
        ["r2", "検証する", "unmet"],
      ]);
    }
  });

  it("JSON として不正なら失敗", () => {
    expect(parseReviewResponse("not json", "rubric", RUBRIC)).toMatchObject({ ok: false });
  });

  it.each([undefined, "", "  "])("本文が空（%j）なら失敗", (text) => {
    expect(parseReviewResponse(text, "rubric", RUBRIC)).toMatchObject({ ok: false });
  });

  it("採点基準にない key は失敗", () => {
    const text = rubricResponse({
      requirements: [
        { key: "r1", status: "met", comment: "a" },
        { key: "r9", status: "met", comment: "b" },
      ],
    });
    expect(parseReviewResponse(text, "rubric", RUBRIC)).toMatchObject({ ok: false });
  });

  it("要件が不足・過剰・重複していたら失敗", () => {
    const one = rubricResponse({ requirements: [{ key: "r1", status: "met", comment: "a" }] });
    const three = rubricResponse({
      requirements: [
        { key: "r1", status: "met", comment: "a" },
        { key: "r2", status: "met", comment: "a" },
        { key: "r2", status: "met", comment: "a" },
      ],
    });
    const dup = rubricResponse({
      requirements: [
        { key: "r1", status: "met", comment: "a" },
        { key: "r1", status: "met", comment: "a" },
      ],
    });
    expect(parseReviewResponse(one, "rubric", RUBRIC).ok).toBe(false);
    expect(parseReviewResponse(three, "rubric", RUBRIC).ok).toBe(false);
    expect(parseReviewResponse(dup, "rubric", RUBRIC).ok).toBe(false);
  });

  it("改善提案が上限を超えたら失敗", () => {
    expect(
      parseReviewResponse(rubricResponse({ suggestions: ["a", "b", "c"] }), "rubric", RUBRIC).ok
    ).toBe(false);
  });

  it("status が列挙外なら失敗", () => {
    const text = rubricResponse({
      requirements: [
        { key: "r1", status: "great", comment: "a" },
        { key: "r2", status: "met", comment: "a" },
      ],
    });
    expect(parseReviewResponse(text, "rubric", RUBRIC).ok).toBe(false);
  });

  it("estimated: AI が付けた key と name を使う", () => {
    const text = JSON.stringify({
      requirements: [{ key: "r1", name: "要件A", status: "met", comment: "c" }],
      code_quality: { level: "fair", comment: "c" },
      suggestions: [],
      advice: "a",
    });

    const result = parseReviewResponse(text, "estimated", null);

    expect(result.ok && result.reviewJson.requirements[0].name).toBe("要件A");
  });

  it("none: 品質レベルは fair に固定し、要件は空にする", () => {
    const text = JSON.stringify({
      code_quality: { comment: "URL形式は妥当" },
      suggestions: ["x"],
      advice: "a",
      // Extra number written by the AI must never leak into the result.
      score: 99,
    });

    const result = parseReviewResponse(text, "none", null);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reviewJson.requirements).toEqual([]);
      expect(result.reviewJson.code_quality.level).toBe("fair");
      expect(JSON.stringify(result.reviewJson)).not.toContain("99");
    }
  });
});

describe("generateReview", () => {
  const baseParams = {
    exerciseInstructions: "ログイン画面を作る",
    submission: CODE_SUBMISSION,
    referenceAnswer: null,
    gradingRubric: RUBRIC,
    apiKey: MEMBER_KEY,
  };

  it("構造化JSON設定で呼び、点数はコードが計算して返す（rubric）", async () => {
    generateContentMock.mockResolvedValue({
      text: rubricResponse(),
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40, thoughtsTokenCount: 300 },
    });

    const result = await generateReview(baseParams);

    expect(GoogleGenAIMock).toHaveBeenCalledWith({ apiKey: MEMBER_KEY });
    expect(generateContentMock).toHaveBeenCalledWith({
      model: GEMINI_MODEL_NAME,
      contents: buildUserPrompt("ログイン画面を作る", CODE_SUBMISSION, null, RUBRIC),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        temperature: GEMINI_TEMPERATURE,
        responseMimeType: "application/json",
        responseSchema: expect.objectContaining({ type: "OBJECT" }),
        thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL },
        abortSignal: expect.any(AbortSignal),
      },
    });
    expect(GEMINI_TEMPERATURE).toBe(0);
    // (1 + 0.5) / 2 * 80 + good(1) * 20 = 80
    expect(result).toMatchObject({
      scoreKind: "rubric",
      rubricVersion: 3,
      overallScore: 80,
      passed: null,
      modelUsed: GEMINI_MODEL_NAME,
      promptTokens: 120,
      completionTokens: 40,
      thoughtsTokens: 300,
    });
    expect(result.reviewContent).toContain("**80/100**");
    expect(JSON.stringify(result)).not.toContain(MEMBER_KEY);
  });

  it("responseSchema は採点基準の key を enum で縛り、件数を固定する", async () => {
    generateContentMock.mockResolvedValue({ text: rubricResponse() });

    await generateReview(baseParams);

    const schema = generateContentMock.mock.calls[0][0].config.responseSchema;
    expect(schema.properties.requirements.minItems).toBe("2");
    expect(schema.properties.requirements.maxItems).toBe("2");
    expect(schema.properties.requirements.items.properties.key.enum).toEqual(["r1", "r2"]);
    expect(schema.properties.suggestions.maxItems).toBe("2");
  });

  it("採点基準なしのコード提出は estimated（rubric_version なし）", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        requirements: [{ key: "r1", name: "要件A", status: "unmet", comment: "c" }],
        code_quality: { level: "poor", comment: "c" },
        suggestions: [],
        advice: "a",
      }),
    });

    const result = await generateReview({ ...baseParams, gradingRubric: null });

    expect(result).toMatchObject({
      scoreKind: "estimated",
      rubricVersion: null,
      overallScore: 0,
      passed: null,
    });
    expect(result.reviewContent).toContain("参考採点");
  });

  it("URL 提出は none（点数なし）", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ code_quality: { comment: "ok" }, suggestions: [], advice: "a" }),
    });

    const result = await generateReview({
      ...baseParams,
      submission: { type: "url", content: "https://example.com" },
    });

    expect(result).toMatchObject({
      scoreKind: "none",
      rubricVersion: null,
      overallScore: null,
      passed: null,
    });
    const schema = generateContentMock.mock.calls[0][0].config.responseSchema;
    expect(schema.properties.requirements).toBeUndefined();
  });

  it("usageMetadata が無い、または thoughtsTokenCount が無い場合は該当トークンを null にする", async () => {
    generateContentMock.mockResolvedValueOnce({ text: rubricResponse() });
    const none = await generateReview(baseParams);
    expect(none.promptTokens).toBeNull();
    expect(none.completionTokens).toBeNull();
    expect(none.thoughtsTokens).toBeNull();

    generateContentMock.mockResolvedValueOnce({
      text: rubricResponse(),
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6 },
    });
    const noThoughts = await generateReview(baseParams);
    expect(noThoughts.promptTokens).toBe(5);
    expect(noThoughts.thoughtsTokens).toBeNull();
  });

  it("検証に失敗したら1回だけ再生成し、両方のトークンを合算する", async () => {
    generateContentMock
      .mockResolvedValueOnce({
        text: "not json",
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 50 },
      })
      .mockResolvedValueOnce({
        text: rubricResponse(),
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30, thoughtsTokenCount: 70 },
      });

    const result = await generateReview(baseParams);

    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      promptTokens: 200,
      completionTokens: 40,
      thoughtsTokens: 120,
    });
  });

  it("再生成でも検証に失敗したら ReviewGenerationError を投げ、消費トークンを持たせる", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ requirements: [] }),
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 50 },
    });

    const error = await generateReview(baseParams).catch((e: unknown) => e);

    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(ReviewGenerationError);
    expect((error as ReviewGenerationError).usage).toEqual({
      promptTokens: 200,
      completionTokens: 20,
      thoughtsTokens: 100,
    });
  });

  it.each([undefined, "", "   "])("本文が空（%j）でも1回再生成し、なお空なら例外", async (text) => {
    generateContentMock.mockResolvedValue({ text });

    await expect(generateReview(baseParams)).rejects.toThrow(
      "Gemini APIからレビュー結果を取得できませんでした"
    );
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });

  it("再生成の後半が失敗した場合も最初の応答の消費トークンを引き継ぐ", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generateContentMock
      .mockResolvedValueOnce({
        text: "bad",
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1 },
      })
      .mockRejectedValueOnce(new Error("boom"));

    const error = await generateReview(baseParams).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ReviewGenerationError);
    expect((error as ReviewGenerationError).usage.promptTokens).toBe(10);
  });

  it("再生成が 503 でリトライを使い切ったら、検証失敗の理由ではなく混雑の案内を出し、status をログに残す", async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    generateContentMock
      .mockResolvedValueOnce({
        text: "not json",
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1 },
      })
      .mockRejectedValue(new ApiError({ message: '{"error":{"code":503}}', status: 503 }));

    const settled = generateReview(baseParams).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const error = await settled;

    expect(error).toBeInstanceOf(ReviewGenerationError);
    expect((error as Error).message).toBe(
      "AIが混み合っています。しばらく時間を置いてから再試行してください。"
    );
    expect((error as ReviewGenerationError).usage.promptTokens).toBe(10);
    expect(generateContentMock).toHaveBeenCalledTimes(1 + GEMINI_MAX_RETRIES + 1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("status=503"),
      expect.any(String)
    );
  });

  it("429 は指数バックオフで最大2回リトライする", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const rateLimitError = new ApiError({ message: "Too Many Requests", status: 429 });
    generateContentMock
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        text: rubricResponse(),
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
    expect(result.overallScore).toBe(80);
  });

  it("429 がリトライ上限を超えたら日本語の上限メッセージを投げる", async () => {
    vi.useFakeTimers();
    generateContentMock.mockRejectedValue(
      new ApiError({ message: "Too Many Requests", status: 429 })
    );

    const resultPromise = generateReview(baseParams);
    const assertion = expect(resultPromise).rejects.toThrow(
      "Gemini APIの利用上限に達しました。しばらく時間を置いてから再試行してください。"
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(generateContentMock).toHaveBeenCalledTimes(GEMINI_MAX_RETRIES + 1);
  });

  it("503 は指数バックオフでリトライし、成功応答があればレビューを生成する", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const overloadedError = new ApiError({ message: '{"error":{"code":503}}', status: 503 });
    generateContentMock
      .mockRejectedValueOnce(overloadedError)
      .mockRejectedValueOnce(overloadedError)
      .mockResolvedValueOnce({ text: rubricResponse() });

    const resultPromise = generateReview(baseParams);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(generateContentMock).toHaveBeenCalledTimes(GEMINI_MAX_RETRIES + 1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), GEMINI_RETRY_BASE_DELAY_MS);
    expect(setTimeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      GEMINI_RETRY_BASE_DELAY_MS * 2
    );
    expect(result.overallScore).toBe(80);
  });

  it("503 が続いてリトライが尽きたら日本語の混雑メッセージを投げ、生JSONを含めない", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rawBody =
      '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}';
    generateContentMock.mockRejectedValue(new ApiError({ message: rawBody, status: 503 }));

    const resultPromise = generateReview(baseParams);
    const settled = resultPromise.catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const error = await settled;

    expect(error).toBeInstanceOf(ReviewGenerationError);
    expect((error as Error).message).toBe(
      "AIが混み合っています。しばらく時間を置いてから再試行してください。"
    );
    expect((error as Error).message).not.toContain("UNAVAILABLE");
    expect(generateContentMock).toHaveBeenCalledTimes(GEMINI_MAX_RETRIES + 1);
  });

  it("503 が即座に返らず全体予算を使い切った場合は、リトライ回数が残っていても待機せず打ち切る", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const overloadedError = new ApiError({ message: "overloaded", status: 503 });
    generateContentMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(overloadedError), GEMINI_TOTAL_BUDGET_MS - 1000);
        })
    );

    const startedAt = Date.now();
    const resultPromise = generateReview(baseParams);
    const assertion = expect(resultPromise).rejects.toThrow(
      "AIが混み合っています。しばらく時間を置いてから再試行してください。"
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - startedAt).toBeLessThanOrEqual(GEMINI_TOTAL_BUDGET_MS);
  });

  it("400 の ApiError はリトライせず、生JSONの代わりにステータスコードだけを示す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generateContentMock.mockRejectedValue(
      new ApiError({ message: `{"error":{"code":400,"message":"key ${MEMBER_KEY}"}}`, status: 400 })
    );

    await expect(generateReview(baseParams)).rejects.toThrow(
      "AIレビューの生成中にエラーが発生しました（コード: 400）。"
    );
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("ApiError でないエラーはリトライせず、受講生には固定の文言、ログにはキーを伏せた元のメッセージを出す", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    generateContentMock.mockRejectedValue(new TypeError(`fetch failed ${MEMBER_KEY}`));

    const error = await generateReview(baseParams).catch((e: unknown) => e);

    expect((error as Error).message).toBe(
      "AIレビューの生成中にエラーが発生しました。しばらく時間を置いてから再試行してください。"
    );
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("fetch failed [redacted]");
    expect(logged).not.toContain(MEMBER_KEY);
  });

  it("GEMINI_REQUEST_TIMEOUT_MS でリクエストごとのタイムアウトを設定する", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    generateContentMock.mockResolvedValue({ text: rubricResponse() });

    await generateReview(baseParams);

    expect(timeoutSpy).toHaveBeenCalledWith(GEMINI_REQUEST_TIMEOUT_MS);
  });

  it("個々の試行タイムアウトと、全試行共有のGEMINI_TOTAL_BUDGET_MSをAbortSignal.anyで合成する", async () => {
    const anySpy = vi.spyOn(AbortSignal, "any");
    generateContentMock.mockResolvedValue({ text: rubricResponse() });

    await generateReview(baseParams);

    expect(anySpy).toHaveBeenCalledWith([expect.any(AbortSignal), expect.any(AbortSignal)]);
  });

  it("429が即座に返らず全体予算を使い切った場合は、リトライ回数が残っていても待機せず打ち切る", async () => {
    vi.useFakeTimers();
    const rateLimitError = new ApiError({ message: "Too Many Requests", status: 429 });
    generateContentMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(rateLimitError), GEMINI_TOTAL_BUDGET_MS - 1000);
        })
    );

    const resultPromise = generateReview(baseParams);
    const assertion = expect(resultPromise).rejects.toThrow(
      "Gemini APIの利用上限に達しました。しばらく時間を置いてから再試行してください。"
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  describe("リトライ中のタイムアウト", () => {
    // The AbortSignal.timeout spy must not leak into the tests after this block.
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // AbortSignal.timeout runs on Node's own timers; route it through the faked setTimeout so the
    // per-attempt and overall deadlines fire in fake time.
    const useFakeSignals = () => {
      vi.useFakeTimers();
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), ms);
        return controller.signal;
      });
    };
    const rejectAfter = (ms: number, error: unknown) => () =>
      new Promise((_resolve, reject) => setTimeout(() => reject(error), ms));
    const hangUntilAborted = (request: { config: { abortSignal: AbortSignal } }) =>
      new Promise((_resolve, reject) =>
        request.config.abortSignal.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError"))
        )
      );
    const overloaded = new ApiError({ message: "overloaded", status: 503 });

    it("503 のリトライが全体の期限で打ち切られたら、混雑として報告し status をログに残す", async () => {
      useFakeSignals();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // 503 at 30s, retry at 35s: the overall 45s deadline fires before the attempt's own 25s.
      generateContentMock
        .mockImplementationOnce(rejectAfter(30_000, overloaded))
        .mockImplementationOnce(hangUntilAborted);

      const settled = generateReview(baseParams).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const error = await settled;

      expect((error as Error).message).toBe(
        "AIが混み合っています。しばらく時間を置いてから再試行してください。"
      );
      expect(generateContentMock).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("status=503"),
        expect.any(String)
      );
    });

    it("リトライが試行ごとの上限で切れた（実際に遅かった）場合はタイムアウトとして報告する", async () => {
      useFakeSignals();
      generateContentMock
        .mockRejectedValueOnce(overloaded)
        .mockImplementationOnce(hangUntilAborted);

      const settled = generateReview(baseParams).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const error = await settled;

      expect((error as Error).message).toBe(
        "Gemini APIの応答がタイムアウトしました。しばらく時間を置いてから再試行してください。"
      );
      expect(generateContentMock).toHaveBeenCalledTimes(2);
    });

    it("待機後に GEMINI_RETRY_MIN_ATTEMPT_MS も残らないならリトライしない（課金だけされる試行を始めない）", async () => {
      useFakeSignals();
      vi.spyOn(console, "error").mockImplementation(() => {});
      // 503 at 36s: 36 + 5 (wait) + 5 (minimum attempt) > 45.
      generateContentMock.mockImplementationOnce(rejectAfter(36_000, overloaded));

      const settled = generateReview(baseParams).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const error = await settled;

      expect((error as Error).message).toBe(
        "AIが混み合っています。しばらく時間を置いてから再試行してください。"
      );
      expect(generateContentMock).toHaveBeenCalledTimes(1);
      expect(GEMINI_RETRY_MIN_ATTEMPT_MS).toBeGreaterThan(0);
    });
  });

  it("応答がタイムアウトした場合は日本語のタイムアウトメッセージを投げ、リトライしない", async () => {
    generateContentMock.mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError")
    );

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
});

describe("generateGradingRubricDraft", () => {
  const draft = {
    requirements: [
      { name: "A", description: "a" },
      { name: "B", description: "b" },
      { name: "C", description: "c" },
    ],
  };

  it("下書きを返し、構造化JSON設定で呼ぶ", async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(draft) });

    const result = await generateGradingRubricDraft({
      exerciseInstructions: "課題",
      referenceAnswer: "模範",
      apiKey: MEMBER_KEY,
    });

    expect(result).toEqual(draft.requirements);
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: buildRubricDraftPrompt("課題", "模範"),
        config: expect.objectContaining({
          systemInstruction: RUBRIC_DRAFT_SYSTEM_PROMPT,
          temperature: GEMINI_TEMPERATURE,
          responseMimeType: "application/json",
        }),
      })
    );
    expect(buildRubricDraftPrompt("課題", "模範")).toContain("## 模範回答\n模範");
  });

  it("件数が範囲外なら1回再生成し、なお不正なら例外", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ requirements: [{ name: "A", description: "a" }] }),
    });

    await expect(
      generateGradingRubricDraft({ exerciseInstructions: "課題", apiKey: MEMBER_KEY })
    ).rejects.toBeInstanceOf(ReviewGenerationError);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });
});
