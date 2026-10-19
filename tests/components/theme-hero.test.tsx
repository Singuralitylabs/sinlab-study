import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeHero } from "@/app/(authenticated)/learn/components/ThemeHero";

const render = (heroImageUrl: string | null, thumbnailUrl: string | null) =>
  renderToStaticMarkup(<ThemeHero heroImageUrl={heroImageUrl} thumbnailUrl={thumbnailUrl} />);

const encoded = (path: string) => encodeURIComponent(path);

describe("ThemeHero", () => {
  it("専用画像があればサムネイルより優先する", () => {
    const html = render("/storage/v1/object/public/thumbnails/theme-1/hero.png?v=1", "/t.png");
    expect(html).toContain(encoded("theme-1/hero.png"));
    expect(html).not.toContain(encoded("/t.png"));
  });

  it("専用画像がなければサムネイルを使い、切り抜き（object-cover）で表示する", () => {
    const html = render(null, "/storage/v1/object/public/thumbnails/theme-1/thumbnail.png?v=1");
    expect(html).toContain(encoded("theme-1/thumbnail.png"));
    expect(html).toContain("object-cover");
  });

  it("どちらも無ければ何も描画しない", () => {
    expect(render(null, null)).toBe("");
  });

  it("装飾画像なので alt は空にする", () => {
    expect(render(null, "/storage/v1/object/public/thumbnails/theme-1/thumbnail.png")).toContain(
      'alt=""'
    );
  });
});
