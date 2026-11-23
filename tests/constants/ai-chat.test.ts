import { describe, expect, it } from "vitest";
import { aiChatKindOf } from "@/app/constants/ai-chat";

describe("aiChatKindOf", () => {
  it("記事は text、演習は exercise", () => {
    expect(aiChatKindOf({ content_type: "text", text_content: null })).toBe("text");
    expect(aiChatKindOf({ content_type: "exercise", text_content: null })).toBe("exercise");
  });

  it("記事（text_content）のあるスライドは記事として扱う", () => {
    expect(aiChatKindOf({ content_type: "slide", text_content: "## 解説" })).toBe("text");
  });

  it.each([null, "", " \n "])("記事の無いスライド（%j）は対象外", (text) => {
    expect(aiChatKindOf({ content_type: "slide", text_content: text })).toBeNull();
  });

  it.each(["video", "quiz"] as const)("%s は本文があっても対象外", (type) => {
    expect(aiChatKindOf({ content_type: type, text_content: "本文" })).toBeNull();
  });
});
