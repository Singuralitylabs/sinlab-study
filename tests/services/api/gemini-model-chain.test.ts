import { ApiError } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock, GoogleGenAIMock, THIRD_MODEL_NAME } = vi.hoisted(() => {
  const generateContentMock = vi.fn();
  const GoogleGenAIMock = vi.fn(function googleGenAI() {
    return { models: { generateContent: generateContentMock } };
  });
  return {
    generateContentMock,
    GoogleGenAIMock,
    THIRD_MODEL_NAME: "gemini-third-flash",
  };
});

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: GoogleGenAIMock,
  };
});

vi.mock("@/app/constants/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/constants/gemini")>();
  return {
    ...actual,
    GEMINI_MODEL_CONFIGS: [
      ...actual.GEMINI_MODEL_CONFIGS,
      { name: THIRD_MODEL_NAME, thinkingLevel: actual.GEMINI_THINKING_LEVEL },
    ],
  };
});

import { GEMINI_ALTERNATE_MODEL_NAME, GEMINI_MODEL_NAME } from "@/app/constants/gemini";
import { generateReview } from "@/app/services/api/gemini";

const MEMBER_KEY = "member-api-key";

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

function rubricResponse() {
  return JSON.stringify({
    requirements: [
      { key: "r1", status: "met", comment: "ok" },
      { key: "r2", status: "partial", comment: "一部" },
    ],
    code_quality: { level: "good", comment: "読みやすい" },
    suggestions: ["a"],
    advice: "次へ",
  });
}

const baseParams = {
  exerciseInstructions: "ログイン画面を作る",
  submission: CODE_SUBMISSION,
  referenceAnswer: null,
  gradingRubric: RUBRIC,
  apiKey: MEMBER_KEY,
};

describe("3モデルのチェーン", () => {
  const calledModels = () => generateContentMock.mock.calls.map((call) => call[0].model as string);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("途中の 400 でも時間が残っていれば後ろのモデルを呼び、成功すればその modelUsed になる", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    generateContentMock
      .mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 }))
      .mockRejectedValueOnce(new ApiError({ message: `bad ${MEMBER_KEY}`, status: 400 }))
      .mockResolvedValueOnce({ text: rubricResponse() });

    const result = await generateReview(baseParams);

    expect(calledModels()).toEqual([
      GEMINI_MODEL_NAME,
      GEMINI_ALTERNATE_MODEL_NAME,
      THIRD_MODEL_NAME,
    ]);
    expect(result.modelUsed).toBe(THIRD_MODEL_NAME);
    const logged = JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(logged).not.toContain(MEMBER_KEY);
    expect(logged).toContain(THIRD_MODEL_NAME);
  });

  it("先頭の 400 は後ろのモデルを呼ばずチェーンを止める", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generateContentMock.mockRejectedValue(
      new ApiError({ message: `bad ${MEMBER_KEY}`, status: 400 })
    );

    await expect(generateReview(baseParams)).rejects.toThrow(
      "AIレビューの生成中にエラーが発生しました（コード: 400）。"
    );
    expect(calledModels()).toEqual([GEMINI_MODEL_NAME]);
  });

  it("途中の 400 のあと後ろが 404 でも、先に混雑した先頭はバックオフする", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    generateContentMock
      .mockRejectedValueOnce(new ApiError({ message: "busy", status: 503 }))
      .mockRejectedValueOnce(new ApiError({ message: `bad ${MEMBER_KEY}`, status: 400 }))
      .mockRejectedValueOnce(new ApiError({ message: "gone", status: 404 }))
      .mockResolvedValueOnce({ text: rubricResponse() });

    const pending = generateReview(baseParams);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(calledModels()).toEqual([
      GEMINI_MODEL_NAME,
      GEMINI_ALTERNATE_MODEL_NAME,
      THIRD_MODEL_NAME,
      GEMINI_MODEL_NAME,
    ]);
    expect(result.modelUsed).toBe(GEMINI_MODEL_NAME);
  });
});
