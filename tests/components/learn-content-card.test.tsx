import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LearnContentCard } from "@/app/(authenticated)/learn/components/LearnContentCard";
import { CONTENT_TYPE_LEARNER_LABELS, CONTENT_TYPES } from "@/app/constants/content";
import type { ContentType } from "@/app/types";

const base = {
  href: "/learn/1/2/3",
  title: "サンプル",
  contentType: "video" as ContentType,
  number: 4,
  isPublished: true,
  locked: false,
  completed: false,
  aiReviewed: false,
};

const render = (props: Partial<typeof base> = {}) =>
  renderToStaticMarkup(<LearnContentCard {...base} {...props} />);

describe("LearnContentCard（#433）", () => {
  it("コンテンツへのリンク・タイトル・通し番号・種別名を出す", () => {
    const html = render();
    expect(html).toContain('href="/learn/1/2/3"');
    expect(html).toContain("サンプル");
    expect(html).toContain(">4<");
    expect(html).toContain(">動画<");
  });

  it("テキスト種別は「解説記事」と表示する", () => {
    expect(render({ contentType: "text" })).toContain(">解説記事<");
  });

  it.each(CONTENT_TYPES)("種別 %s のラベルをサムネイルに出す", (contentType) => {
    expect(render({ contentType })).toContain(`>${CONTENT_TYPE_LEARNER_LABELS[contentType]}<`);
  });

  it("通常の状態では状態バッジを出さない", () => {
    const html = render();
    expect(html).not.toContain("有料会員向け");
    expect(html).not.toContain("非公開");
    expect(html).not.toContain("AIレビュー済み");
    expect(html).not.toContain('aria-label="完了"');
  });

  it("完了・ロック・未公開を見分けられる", () => {
    expect(render({ completed: true })).toContain('aria-label="完了"');
    expect(render({ locked: true })).toContain("有料会員向け");
    expect(render({ isPublished: false })).toContain("非公開");
  });

  it("AIレビュー済みは、鍵なしの演習だけに出す", () => {
    expect(render({ contentType: "exercise", aiReviewed: true })).toContain("AIレビュー済み");
    expect(render({ contentType: "text", aiReviewed: true })).not.toContain("AIレビュー済み");
    expect(render({ contentType: "exercise", aiReviewed: true, locked: true })).not.toContain(
      "AIレビュー済み"
    );
  });
});
