import { describe, expect, it } from "vitest";
import { AI_CHAT_HISTORY_MAX_MESSAGES } from "@/app/constants/ai-chat";
import { buildChatHistory, formatChatRemaining } from "@/app/lib/ai-chat-client";

describe("buildChatHistory", () => {
  it("回答済みの往復だけを古い順に入れる", () => {
    expect(
      buildChatHistory([
        { id: 1, question: "q1", answer: "a1" },
        { id: 2, question: "q2", answer: null },
      ])
    ).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
    ]);
  });

  it(`直近 ${AI_CHAT_HISTORY_MAX_MESSAGES} 件までにする（質問から始まる）`, () => {
    const turns = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      question: `q${i}`,
      answer: `a${i}`,
    }));
    const history = buildChatHistory(turns);
    expect(history).toHaveLength(AI_CHAT_HISTORY_MAX_MESSAGES);
    expect(history[0]).toEqual({ role: "user", content: "q2" });
    expect(history.at(-1)).toEqual({ role: "assistant", content: "a4" });
  });
});

describe("formatChatRemaining", () => {
  it("有料会員は今日、お試しは通算の残りを出す", () => {
    expect(formatChatRemaining({ remaining: 18, limit: 20, period: "daily", resetsAt: "x" })).toBe(
      "今日はあと 18 回"
    );
    expect(
      formatChatRemaining({ remaining: 3, limit: 5, period: "lifetime", resetsAt: null })
    ).toBe("お試しであと 3 回");
  });
});
