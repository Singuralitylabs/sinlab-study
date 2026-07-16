import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock, getGenerativeModelMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  getGenerativeModelMock: vi.fn(),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(function GoogleGenerativeAI() {
    return {
      getGenerativeModel: getGenerativeModelMock,
    };
  }),
}));

import { generateReview } from "@/app/services/api/gemini";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GEMINI_API_KEY = "test-api-key";

  getGenerativeModelMock.mockReturnValue({ generateContent: generateContentMock });
});

describe("generateReview", () => {
  it("模範回答・ヒントがある場合は両方をプロンプトへ含める", async () => {
    generateContentMock.mockResolvedValue({
      response: {
        text: () => "総合スコア: 85/100",
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      },
    });

    const result = await generateReview(
      "配列の重複を除去する関数を実装する",
      {
        type: "code",
        files: [{ filename: "index.js", language: "javascript", content: "const x = 1;" }],
      },
      "Setを使って重複除去する",
      "for文でも実装可能です"
    );

    const userPrompt = generateContentMock.mock.calls[0]?.[0] as string;
    expect(userPrompt).toContain("## 模範回答\nSetを使って重複除去する");
    expect(userPrompt).toContain("## 課題のヒント\nfor文でも実装可能です");
    expect(userPrompt.indexOf("## 模範回答")).toBeLessThan(userPrompt.indexOf("## 課題のヒント"));
    expect(result.overallScore).toBe(85);
  });

  it("模範回答・ヒントが未設定の場合は該当セクションを含めない", async () => {
    generateContentMock.mockResolvedValue({
      response: {
        text: () => "総合スコア: 70/100",
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
      },
    });

    await generateReview(
      "ログイン画面を実装する",
      { type: "url", content: "https://example.com/app" },
      null,
      null
    );

    const userPrompt = generateContentMock.mock.calls[0]?.[0] as string;
    expect(userPrompt).not.toContain("## 模範回答");
    expect(userPrompt).not.toContain("## 課題のヒント");
  });
});
