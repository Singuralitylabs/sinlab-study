import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("Markdown中の生HTML（script・onerror属性）をエスケープされたテキストとして描画し、DOMに反映しない", () => {
    const content = "danger: <script>alert('xss')</script> <img src=x onerror=alert(1)>";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).not.toMatch(/<script>/);
    expect(html).not.toMatch(/<img\s/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("javascript: スキームのリンクをそのまま描画しない、あるいは無害化する", () => {
    const content = "[click me](javascript:alert(1))";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).not.toContain('href="javascript:alert(1)"');
  });

  it("コードフェンス内のHTML/JSはエスケープされたテキストとして表示され、内容が破損しない", () => {
    const content = '```html\n<div class="a">hi</div>\n```';

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain("&lt;div class=&quot;a&quot;&gt;hi&lt;/div&gt;");
  });
});
