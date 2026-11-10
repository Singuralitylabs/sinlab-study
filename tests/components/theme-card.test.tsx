/**
 * @vitest-environment happy-dom
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeCard } from "@/app/(authenticated)/components/ThemeProgressSections";
import type { ThemeProgressSummary } from "@/app/services/api/learning-server";

const baseSummary: ThemeProgressSummary = {
  theme: {
    id: 1,
    name: "テーマA",
    description: "説明文です",
    image_url: null,
    hero_image_url: null,
    display_order: 1,
    is_published: true,
    is_deleted: false,
    created_at: null,
    updated_at: null,
  },
  totalContents: 4,
  completedContents: 2,
};

describe("ThemeCard", () => {
  it("既定の layout=row は横長（左ボーダー用クラス）でホーム向け", () => {
    const html = renderToStaticMarkup(<ThemeCard summary={baseSummary} />);
    expect(html).toContain("w-36");
    expect(html).not.toContain("aspect-video");
    expect(html).toContain("テーマA");
    expect(html).toContain("2 / 4");
  });

  it("layout=card はグリッド用に aspect-video と縦積みになる (#415)", () => {
    const html = renderToStaticMarkup(<ThemeCard summary={baseSummary} layout="card" />);
    expect(html).toContain("aspect-video");
    expect(html).not.toContain("w-36 shrink-0");
    expect(html).toContain("テーマA");
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("h-full");
    // Link replaces Card as the parent of thumbnail + body, so it must keep Card's gap-6.
    expect(html).toContain("flex min-h-0 flex-1 flex-col gap-6");
    expect(html).not.toContain("修了");
    expect(html).not.toContain("border-success");
  });

  const completed: ThemeProgressSummary = { ...baseSummary, completedContents: 4 };

  it.each(["card", "row"] as const)(
    "layout=%s の修了カードは修了バッジと修了証リンクをカード内に置き、リンクを入れ子にしない (#553)",
    (layout) => {
      const html = renderToStaticMarkup(
        <ThemeCard summary={completed} layout={layout} certificatesHref="/certificates" />
      );
      const root = new DOMParser().parseFromString(html, "text/html").body;
      const card = root.querySelector('[data-slot="card"]');
      expect(card).not.toBeNull();
      expect(card?.className).toContain("border-success");
      expect(card?.textContent).toContain("修了");
      const certificateLink = card?.querySelector('a[href="/certificates"]');
      expect(certificateLink?.textContent).toContain("修了証を見る");
      expect(card?.querySelector('a[href="/learn/1"]')?.textContent).toContain("修了");
      expect(root.querySelector("a a")).toBeNull();
      expect(card?.textContent).toMatch(/4 \/ 4\s*修了/);
      expect(card?.querySelector('[data-slot="progress"]')?.className).toContain("bg-success/20");
    }
  );

  it("修了済みでも certificatesHref が無ければ修了証リンクを出さない", () => {
    const html = renderToStaticMarkup(<ThemeCard summary={completed} layout="card" />);
    expect(html).toContain("修了");
    expect(html).not.toContain("修了証を見る");
  });

  it("未修了なら certificatesHref を渡しても修了証リンクを出さない", () => {
    const html = renderToStaticMarkup(
      <ThemeCard summary={baseSummary} layout="card" certificatesHref="/certificates" />
    );
    expect(html).not.toContain("修了証を見る");
  });
});
