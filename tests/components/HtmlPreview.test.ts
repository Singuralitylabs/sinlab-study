import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HtmlPreview } from "@/app/components/HtmlPreview";
import { PREVIEW_CONSOLE_MESSAGE_TYPE } from "@/app/lib/preview-console";

const JS_ONLY = [{ filename: "main.js", language: "javascript", content: 'console.log("hi")' }];

const render = (props: Parameters<typeof HtmlPreview>[0]) =>
  renderToStaticMarkup(createElement(HtmlPreview, props));

describe("HtmlPreview", () => {
  it("JavaScript 単独でも iframe にコンソールの中継を差し込み、コンソール欄を出す", () => {
    const html = render({ files: JS_ONLY });
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain(PREVIEW_CONSOLE_MESSAGE_TYPE);
    expect(html).toContain("コンソール");
    expect(html).toContain("コンソールを隠す");
  });

  it("折りたたみ（提出履歴・コンテンツ詳細）は開くまで iframe もコンソール欄も出さない", () => {
    const html = render({ files: JS_ONLY, collapsible: true });
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("コンソールを隠す");
    expect(html).toContain("プレビューを表示");
  });
});
