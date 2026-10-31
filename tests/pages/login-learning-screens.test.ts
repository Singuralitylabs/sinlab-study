import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const CLIP_URL = "https://www.youtube.com/watch?v=abc123";

const renderScreens = async (clipUrl: string) => {
  vi.resetModules();
  vi.doMock("@/app/constants/login", () => ({ LOGIN_CLIP_URL: clipUrl }));
  const { LearningScreens } = await import("@/app/(auth)/login/components/learning-screens");
  return renderToStaticMarkup(LearningScreens());
};

describe("LearningScreens", () => {
  afterEach(() => {
    vi.doUnmock("@/app/constants/login");
  });

  it("5ステップを順番に見出しつきで表示する", async () => {
    const html = await renderScreens("");
    const titles = [
      "動画で学ぶ",
      "解説記事で読む",
      "課題を提出する",
      "AIがすぐにレビュー",
      "復習リストで振り返る",
    ];

    const positions = titles.map((title) => html.indexOf(`>${title}</h3>`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("切り抜き動画のURLが空なら、サムネイル画像だけを出す", async () => {
    const html = await renderScreens("");

    expect(html).toContain('alt="解説動画のサムネイル"');
    expect(html).not.toContain("動画を再生");
  });

  it("切り抜き動画のURLがあれば、クリックで読み込む再生枠を出す", async () => {
    const html = await renderScreens(CLIP_URL);

    expect(html).toContain('aria-label="動画を再生"');
    expect(html).toContain("i.ytimg.com/vi/abc123/hqdefault.jpg");
    expect(html).not.toContain('alt="解説動画のサムネイル"');
  });
});
