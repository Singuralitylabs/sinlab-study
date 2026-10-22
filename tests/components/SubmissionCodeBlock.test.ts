import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/HtmlPreviewNoSSR", () => ({
  HtmlPreviewNoSSR: (props: { showPreviewFrame?: boolean; showConsolePanel?: boolean }) =>
    createElement(
      "div",
      {
        "data-preview": String(!!props.showPreviewFrame),
        "data-console": String(!!props.showConsolePanel),
      },
      "preview-host"
    ),
}));

import { SubmissionCodeBlock } from "@/app/components/SubmissionCodeBlock";

const htmlFiles = [{ filename: "index.html", language: "html", content: "<p>hi</p>" }];
const jsFiles = [{ filename: "main.js", language: "javascript", content: "console.log(1)" }];

const render = (props: Parameters<typeof SubmissionCodeBlock>[0]) =>
  renderToStaticMarkup(createElement(SubmissionCodeBlock, props));

describe("SubmissionCodeBlock の previewSource", () => {
  it("previewSource が無いときは提出ファイル自身の自動規則で出す", () => {
    const html = render({ files: htmlFiles });
    expect(html).toContain('data-preview="true"');
    expect(html).toContain('data-console="true"');
  });

  it("previewSource の課題設定でプレビューだけオフにできる", () => {
    const html = render({
      files: htmlFiles,
      previewSource: {
        submissionFileSlots: [{ filename: "index.html", language: "html" }],
        starterFiles: null,
        codeLanguage: "html",
        showPreview: false,
        showConsole: true,
      },
    });
    expect(html).toContain('data-preview="false"');
    expect(html).toContain('data-console="true"');
  });

  it("課題が JavaScript だけならコンソールのみ（プレビュー枠なし）", () => {
    const html = render({
      files: jsFiles,
      previewSource: {
        submissionFileSlots: [{ filename: "main.js", language: "javascript" }],
        starterFiles: null,
        codeLanguage: "javascript",
        showPreview: null,
        showConsole: null,
      },
    });
    expect(html).toContain('data-preview="false"');
    expect(html).toContain('data-console="true"');
  });

  it("どちらもオフならプレビュー宿主を出さない", () => {
    const html = render({
      files: [{ filename: "q.sql", language: "sql", content: "select 1" }],
      previewSource: {
        submissionFileSlots: [{ filename: "q.sql", language: "sql" }],
        starterFiles: null,
        codeLanguage: "sql",
        showPreview: null,
        showConsole: null,
      },
    });
    expect(html).not.toContain("preview-host");
  });

  it("React 構成（App.jsx）はプレビューとコンソールの両方を出す", () => {
    const reactFiles = [
      {
        filename: "App.jsx",
        language: "javascript",
        content: "export default function App(){ return <h1>Hi</h1>; }",
      },
    ];
    const html = render({
      files: reactFiles,
      previewSource: {
        submissionFileSlots: [{ filename: "App.jsx", language: "javascript" }],
        starterFiles: null,
        codeLanguage: "javascript",
        showPreview: null,
        showConsole: null,
      },
    });
    expect(html).toContain('data-preview="true"');
    expect(html).toContain('data-console="true"');
  });
});
