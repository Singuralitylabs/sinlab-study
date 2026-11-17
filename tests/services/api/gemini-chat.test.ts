import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock, GoogleGenAIMock } = vi.hoisted(() => {
  const generateContentMock = vi.fn();
  const GoogleGenAIMock = vi.fn(function googleGenAI() {
    return { models: { generateContent: generateContentMock } };
  });
  return { generateContentMock, GoogleGenAIMock };
});

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return { ...actual, GoogleGenAI: GoogleGenAIMock };
});

import {
  AI_CHAT_CUT_NOTE,
  AI_CHAT_MAX_OUTPUT_TOKENS,
  AI_CHAT_TEMPERATURE,
} from "@/app/constants/ai-chat";
import { GEMINI_MODEL_NAME } from "@/app/constants/gemini";
import { generateChatReply } from "@/app/services/api/gemini";

const response = (text: string, finishReason = "STOP") => ({
  text,
  candidates: [{ finishReason }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("generateChatReply", () => {
  it("平文で、チャット用の出力上限と温度で呼ぶ", async () => {
    generateContentMock.mockResolvedValue(response(" 回答だよ "));
    const result = await generateChatReply({ systemInstruction: "s", contents: "c", apiKey: "k" });
    expect(result).toEqual({
      answer: "回答だよ",
      modelUsed: GEMINI_MODEL_NAME,
      promptTokens: 10,
      completionTokens: 5,
      thoughtsTokens: 2,
    });
    const { config } = generateContentMock.mock.calls[0][0];
    expect(config.responseMimeType).toBe("text/plain");
    expect(config.responseSchema).toBeUndefined();
    expect(config.maxOutputTokens).toBe(AI_CHAT_MAX_OUTPUT_TOKENS);
    expect(config.temperature).toBe(AI_CHAT_TEMPERATURE);
  });

  it("出力上限で切れた回答には、切れたことを書き足す", async () => {
    generateContentMock.mockResolvedValue(response("途中まで", "MAX_TOKENS"));
    const result = await generateChatReply({ systemInstruction: "s", contents: "c", apiKey: "k" });
    expect(result.answer).toBe(`途中まで${AI_CHAT_CUT_NOTE}`);
  });
});
