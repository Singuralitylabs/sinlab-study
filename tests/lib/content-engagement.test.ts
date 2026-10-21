import { describe, expect, it } from "vitest";
import {
  buildContentEngagement,
  compareEngagementForSort,
  completionRate,
  passRate,
} from "@/app/lib/content-engagement";

describe("completionRate / passRate", () => {
  it("分母0の完了率は0、提出0の合格率はnull", () => {
    expect(completionRate(3, 0)).toBe(0);
    expect(completionRate(2, 4)).toBe(0.5);
    expect(passRate(1, 0)).toBeNull();
    expect(passRate(1, 4)).toBe(0.25);
  });
});

describe("buildContentEngagement", () => {
  const contents = [
    {
      id: 1,
      title: "動画A",
      content_type: "video" as const,
      display_order: 1,
      phase_id: 10,
      phase_name: "週1",
      phase_order: 1,
      theme_id: 100,
      theme_name: "Web",
      theme_order: 1,
    },
    {
      id: 2,
      title: "演習B",
      content_type: "exercise" as const,
      display_order: 2,
      phase_id: 10,
      phase_name: "週1",
      phase_order: 1,
      theme_id: 100,
      theme_name: "Web",
      theme_order: 1,
    },
  ];

  it("受講生集合外の進捗・提出は数えず、完了率が低い順に並べる", () => {
    const studentIds = new Set([1, 2, 3]);
    const result = buildContentEngagement(
      contents,
      studentIds,
      [
        { content_id: 1, user_id: 1, is_completed: true, last_viewed_at: "2026-01-01" },
        { content_id: 1, user_id: 2, is_completed: false, last_viewed_at: "2026-01-02" },
        // outside denominator
        { content_id: 1, user_id: 99, is_completed: true, last_viewed_at: "2026-01-03" },
        { content_id: 2, user_id: 1, is_completed: false, last_viewed_at: "2026-01-01" },
      ],
      [
        { content_id: 2, user_id: 1, passed: true },
        { content_id: 2, user_id: 1, passed: false },
        { content_id: 2, user_id: 2, passed: false },
        { content_id: 2, user_id: 99, passed: true },
      ],
      3
    );

    expect(result.studentTotal).toBe(3);
    expect(result.themes).toHaveLength(1);
    const rows = result.themes[0]?.phases[0]?.contents ?? [];
    expect(rows.map((r) => r.contentId)).toEqual([2, 1]);

    const video = rows.find((r) => r.contentId === 1);
    expect(video).toMatchObject({
      viewedCount: 2,
      completedCount: 1,
      completionRate: 1 / 3,
      submissionCount: null,
      passRate: null,
    });

    const exercise = rows.find((r) => r.contentId === 2);
    expect(exercise).toMatchObject({
      viewedCount: 1,
      completedCount: 0,
      completionRate: 0,
      submissionCount: 2,
      passedCount: 1,
      passRate: 0.5,
    });
  });

  it("compareEngagementForSort は完了率→閲覧人数→表示順", () => {
    const base = {
      contentType: "text" as const,
      phaseId: 1,
      phaseName: "p",
      phaseOrder: 1,
      themeId: 1,
      themeName: "t",
      themeOrder: 1,
      completedCount: 0,
      submissionCount: null,
      passedCount: null,
      passRate: null,
    };
    const a = {
      ...base,
      contentId: 1,
      title: "a",
      contentOrder: 2,
      viewedCount: 5,
      completionRate: 0.1,
    };
    const b = {
      ...base,
      contentId: 2,
      title: "b",
      contentOrder: 1,
      viewedCount: 1,
      completionRate: 0.1,
    };
    expect(compareEngagementForSort(a, b)).toBeGreaterThan(0);
  });
});
