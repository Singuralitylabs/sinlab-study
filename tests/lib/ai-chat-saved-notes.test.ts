import { describe, expect, it } from "vitest";
import { buildSavedChatNoteViews } from "@/app/lib/ai-chat-saved-notes";

const meta = (title: string, themeId: number) => ({
  title,
  themeId,
  themeName: `テーマ${themeId}`,
  href: `/learn/${themeId}/1/1`,
});

describe("buildSavedChatNoteViews", () => {
  it("学習順に並べ、同じコンテンツの中は古い順。見えないコンテンツの項目は出さない", () => {
    const metas = new Map([
      [10, meta("A", 1)],
      [20, meta("B", 2)],
    ]);
    const order = new Map([
      [10, 0],
      [20, 1],
    ]);
    const views = buildSavedChatNoteViews(
      [
        { id: 1, content_id: 20, question: "q1", answer: "a1", created_at: "2026-11-01T00:00:00Z" },
        { id: 2, content_id: 10, question: "q2", answer: "a2", created_at: "2026-11-03T00:00:00Z" },
        { id: 3, content_id: 10, question: "q3", answer: "a3", created_at: "2026-11-02T00:00:00Z" },
        { id: 4, content_id: 99, question: "q4", answer: "a4", created_at: "2026-11-02T00:00:00Z" },
      ],
      metas,
      order
    );
    expect(views.map((v) => v.id)).toEqual([3, 2, 1]);
    expect(views[0]).toMatchObject({ contentTitle: "A", themeName: "テーマ1", question: "q3" });
  });
});
