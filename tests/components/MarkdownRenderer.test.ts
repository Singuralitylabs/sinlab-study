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

    expect(html).not.toMatch(/<div class="a">/);
    expect(html).toContain("&lt;");
    expect(html).toContain("&quot;a&quot;");
    expect(html).toContain("hi");
  });

  it("言語指定のあるコードフェンスはシンタックスハイライトのクラスが付与される", () => {
    const content = "```javascript\nconst a = 1;\n```";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain('class="hljs language-javascript"');
    expect(html).toContain("hljs-keyword");
  });

  it("GASはJavaScriptの別名としてハイライトされる", () => {
    const content = "```gas\nfunction main() {}\n```";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain('class="hljs language-gas"');
    expect(html).toContain("hljs-keyword");
  });

  it("言語未指定のコードフェンスはハイライトされずプレーン表示のまま", () => {
    const content = "```\nconst a = 1;\n```";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).not.toContain("hljs");
    expect(html).toContain("const a = 1;");
  });

  it("未対応言語のコードフェンスはエラーにならずプレーン表示のまま", () => {
    const content = '```ruby\nputs "hi"\n```';

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).not.toContain("hljs-keyword");
    expect(html).toContain("puts");
  });

  it("インラインコードにはハイライトのクラスが付与されず、コードブロックと区別される", () => {
    const content = "`const a = 1;`\n\n```javascript\nconst a = 1;\n```";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toMatch(/<code>const a = 1;<\/code>/);
    expect(html).toContain('class="hljs language-javascript"');
  });
});
