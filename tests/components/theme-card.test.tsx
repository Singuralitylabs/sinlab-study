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
    expect(html).toContain("w-32");
    expect(html).not.toContain("aspect-video");
    expect(html).toContain("テーマA");
    expect(html).toContain("2 / 4");
  });

  it("layout=card はグリッド用に aspect-video と縦積みになる (#415)", () => {
    const html = renderToStaticMarkup(<ThemeCard summary={baseSummary} layout="card" />);
    expect(html).toContain("aspect-video");
    expect(html).not.toContain("w-32 shrink-0");
    expect(html).toContain("テーマA");
    expect(html).toContain("line-clamp-2");
    // Outer flex column keeps the 修了 row inside the grid cell when heights stretch.
    expect(html).toContain("flex h-full flex-col");
    expect(html).toContain("min-h-0 flex-1");
  });

  it("修了済み + certificatesHref でもカード本体リンクの外に修了証リンクがある", () => {
    const completed: ThemeProgressSummary = {
      ...baseSummary,
      completedContents: 4,
    };
    const html = renderToStaticMarkup(
      <ThemeCard summary={completed} layout="card" certificatesHref="/certificates" />
    );
    expect(html).toContain('href="/certificates"');
    expect(html).toContain("修了証を見る");
    expect(html).toContain("border-t-success");
    expect(html).toContain("shrink-0 items-center gap-2");
  });
});
