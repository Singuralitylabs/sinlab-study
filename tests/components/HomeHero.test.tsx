import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeHero } from "@/app/(authenticated)/components/HomeHero";

const render = (displayName: string | null) =>
  renderToStaticMarkup(createElement(HomeHero, { displayName }));

describe("HomeHero", () => {
  it("表示名があれば名前入りの挨拶を h1 に出す", () => {
    const html = render("山田太郎");

    expect(html).toContain("<h1");
    expect(html).toContain("おかえりなさい、山田太郎さん");
    expect(html).toContain("今日も少しずつ、続きから進めましょう");
  });

  it("表示名が null・空白のときは名前なしの挨拶にする", () => {
    expect(render(null)).toContain(">おかえりなさい<");
    expect(render("  ")).toContain(">おかえりなさい<");
  });
});
