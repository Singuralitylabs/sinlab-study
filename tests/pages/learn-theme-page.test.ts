import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/learning-server")>()),
  fetchThemeById: vi.fn(),
  fetchPhasesByThemeId: vi.fn(),
  fetchContentSummariesByPhaseIds: vi.fn(),
  fetchUserProgressByContentIds: vi.fn(),
}));
vi.mock("@/app/services/api/ai-review-server", () => ({
  fetchCompletedAIReviewContentIds: vi.fn().mockResolvedValue({ data: new Set<number>() }),
}));

import ThemePage from "@/app/(authenticated)/learn/[themeId]/page";
import {
  fetchContentSummariesByPhaseIds,
  fetchPhasesByThemeId,
  fetchThemeById,
  fetchUserProgressByContentIds,
} from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const summary = (id: number, phase_id: number, title: string, open = true) => ({
  id,
  phase_id,
  title,
  content_type: "text",
  display_order: id,
  is_open_to_trial: open,
  is_published: true,
});

const setup = (userStatus: "trial" | "active", completed: number[]) => {
  vi.mocked(getServerAuth).mockResolvedValue({
    userId: 7,
    userStatus,
    userRole: "member",
  } as never);
  vi.mocked(fetchThemeById).mockResolvedValue({
    data: { id: 1, name: "テーマ", description: null, is_published: true },
    error: null,
  } as never);
  vi.mocked(fetchPhasesByThemeId).mockResolvedValue({
    data: [
      { id: 2, name: "フェーズA", description: null, is_published: true },
      { id: 3, name: "フェーズB", description: null, is_published: true },
    ],
    error: null,
  } as never);
  vi.mocked(fetchContentSummariesByPhaseIds).mockResolvedValue({
    data: [
      summary(10, 2, "A-1"),
      summary(11, 2, "A-2"),
      summary(20, 3, "B-1"),
      summary(21, 3, "B-2", false),
    ],
    error: null,
  } as never);
  vi.mocked(fetchUserProgressByContentIds).mockResolvedValue({
    data: new Map(completed.map((id) => [id, true])),
  } as never);
};

const render = async () =>
  renderToStaticMarkup(await ThemePage({ params: Promise.resolve({ themeId: "1" }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("テーマページのフェーズ アコーディオン（#431）", () => {
  it("フェーズ数によらずコンテンツ取得は 1 回で、コンテンツへ直接リンクする", async () => {
    setup("active", []);
    const html = await render();

    expect(fetchContentSummariesByPhaseIds).toHaveBeenCalledTimes(1);
    expect(fetchContentSummariesByPhaseIds).toHaveBeenCalledWith([2, 3], "member");
    expect(html).toContain('href="/learn/1/2/10"');
    expect(html).toContain('href="/learn/1/3/21"');
    expect(html).toContain('href="/learn/1/3"');
  });

  it("未完了の最初のフェーズだけ開く", async () => {
    setup("active", [10, 11]);
    const html = await render();

    expect(html.match(/<details[^>]* open=""/g)).toHaveLength(1);
    expect(html.indexOf("フェーズB")).toBeGreaterThan(html.indexOf("<details"));
    expect(html).toMatch(/<details[^>]*open=""[^>]*>(?:(?!<\/details>).)*フェーズB/s);
  });

  it("見出しに完了数 / 対象数を出す（お試しは鍵付きを分母に含めない）", async () => {
    setup("trial", [10]);
    const html = await render();

    expect(html).toContain("1 / 2 完了");
    expect(html).toContain("0 / 1 完了");
    expect(html).toContain("有料会員向け");
  });
});
