/**
 * @vitest-environment happy-dom
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/learning-server")>()),
  fetchPublishedThemes: vi.fn(),
  fetchThemeProgressSummaries: vi.fn(),
  fetchComingSoonThemes: vi.fn(),
}));
vi.mock("next/image", () => ({ default: () => null }));

import LearnPage from "@/app/(authenticated)/learn/page";
import {
  fetchComingSoonThemes,
  fetchPublishedThemes,
  fetchThemeProgressSummaries,
} from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const theme = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  description: null,
  image_url: null,
  display_order: id,
  is_published: true,
  is_coming_soon: false,
  ...extra,
});

const comingSoon = {
  id: 20,
  name: "準備中テーマ",
  description: "準備中の説明",
  image_url: null,
  display_order: 20,
};

const render = async () => {
  const html = renderToStaticMarkup(await LearnPage());
  return new DOMParser().parseFromString(html, "text/html").body;
};

const setRole = (userRole: string) => {
  vi.mocked(getServerAuth).mockResolvedValue({
    userId: 7,
    userRole,
    userStatus: "active",
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchThemeProgressSummaries).mockResolvedValue({ data: [], error: null } as never);
  vi.mocked(fetchComingSoonThemes).mockResolvedValue([comingSoon]);
});

describe("学習コンテンツ一覧の準備中テーマ (#593)", () => {
  it("受講者には公開テーマの後ろに、リンクのない coming soon カードを出す", async () => {
    setRole("member");
    vi.mocked(fetchPublishedThemes).mockResolvedValue({
      data: [theme(1, "公開テーマ")],
      error: null,
    } as never);

    const root = await render();

    expect(fetchComingSoonThemes).toHaveBeenCalledTimes(1);
    const text = root.textContent ?? "";
    expect(text.indexOf("公開テーマ")).toBeLessThan(text.indexOf("準備中テーマ"));
    expect(text).toContain("coming soon...");
    expect(root.querySelector('a[href="/learn/1"]')).not.toBeNull();
    expect(root.querySelector('a[href="/learn/20"]')).toBeNull();
  });

  it("公開テーマが0件でも、準備中テーマがあれば空表示にしない", async () => {
    setRole("member");
    vi.mocked(fetchPublishedThemes).mockResolvedValue({ data: [], error: null } as never);

    const root = await render();

    expect(root.textContent).toContain("準備中テーマ");
    expect(root.textContent).not.toContain("学習コンテンツはまだ登録されていません。");
  });

  it.each(["admin", "maintainer"])(
    "%s は RPC を呼ばず、未公開テーマに準備中バッジを付ける（重複させない）",
    async (role) => {
      setRole(role);
      vi.mocked(fetchPublishedThemes).mockResolvedValue({
        data: [
          theme(1, "公開テーマ", { is_coming_soon: true }),
          theme(2, "未公開の準備中", { is_published: false, is_coming_soon: true }),
          theme(3, "下書きテーマ", { is_published: false }),
        ],
        error: null,
      } as never);

      const root = await render();

      expect(fetchComingSoonThemes).not.toHaveBeenCalled();
      expect(root.textContent).not.toContain("coming soon...");
      const cards = [...root.querySelectorAll('[data-slot="card"]')];
      const badgeOf = (name: string) =>
        cards
          .find((c) => c.textContent?.includes(name))
          ?.textContent?.includes("準備中として表示中");
      expect(badgeOf("公開テーマ")).toBe(false);
      expect(badgeOf("未公開の準備中")).toBe(true);
      expect(badgeOf("下書きテーマ")).toBe(false);
    }
  );
});
