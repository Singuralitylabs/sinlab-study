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

  it("コンソールだけは実行まで iframe を出さず、360px のプレビュー枠も出さない", () => {
    const html = render({ files: JS_ONLY, showPreviewFrame: false, showConsolePanel: true });
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("h-[360px]");
    expect(html).toContain("実行");
    expect(html).toContain("コンソール");
    expect(html).not.toContain("allow-same-origin");
  });

  it("プレビューだけでコンソール欄を出さない", () => {
    const html = render({
      files: [{ filename: "index.html", language: "html", content: "<p>hi</p>" }],
      showPreviewFrame: true,
      showConsolePanel: false,
    });
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain("h-[360px]");
    expect(html).not.toContain("コンソールを隠す");
    expect(html).not.toContain(PREVIEW_CONSOLE_MESSAGE_TYPE);
  });

  it("折りたたみ（提出履歴・コンテンツ詳細）は開くまで iframe もコンソール欄も出さない", () => {
    const html = render({ files: JS_ONLY, collapsible: true });
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("コンソールを隠す");
    expect(html).toContain("プレビューを表示");
  });

  it("React 構成ではプレビュー枠とコンソールを出し、sandbox は allow-scripts のみ", () => {
    const html = render({
      files: [
        {
          filename: "App.jsx",
          language: "javascript",
          content: "export default function App(){ return <h1>Hi</h1>; }",
        },
      ],
      showPreviewFrame: true,
      showConsolePanel: true,
    });
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain("h-[360px]");
    expect(html).toContain("コンソール");
    expect(html).toContain("プレビュー");
    expect(html).toContain(PREVIEW_CONSOLE_MESSAGE_TYPE);
  });
});
