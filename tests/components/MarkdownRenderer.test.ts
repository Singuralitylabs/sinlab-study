import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX } from "@/app/constants/markdown";

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

  it("外部リンクは別タブで開き、noopener noreferrer と読み上げ用の注記を付ける", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, { content: "[公式](https://example.com/docs)" })
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("新しいタブで開きます");
  });

  it("画像だけのリンクにはアイコンを付けないが、別タブと注記は維持する", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        content: "[![図](https://example.com/a.png)](https://example.com)",
      })
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain("新しいタブで開きます");
    expect(html).not.toContain("lucide");
  });

  it("内部リンク・アンカー・mailto は同じタブのまま", () => {
    const content = "[a](/learn/1) [b](#x) [c](mailto:a@example.com)";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).not.toContain("_blank");
    expect(html).not.toContain("新しいタブ");
  });

  it("コードフェンス内のHTML/JSはエスケープされたテキストとして表示され、内容が破損しない", () => {
    const content = '```html\n<div class="a">hi</div>\n```';

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).not.toMatch(/<div class="a">/);
    // Highlighting inserts hljs-* span tags, so strip tags and check that the escaped content
    // matches exactly, with nothing missing or reordered.
    expect(html.replace(/<[^>]+>/g, "")).toContain("&lt;div class=&quot;a&quot;&gt;hi&lt;/div&gt;");
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

    // No hljs class at all; it stays a plain `<code class="language-ruby">`.
    expect(html).not.toContain("hljs");
    expect(html).toContain('<code class="language-ruby">puts &quot;hi&quot;\n</code>');
  });

  it.each([
    ["sql", "SELECT id FROM users;"],
    ["bash", "echo $HOME"],
    ["markdown", "# 見出し"],
    ["python", "def main():\n    pass"],
    ["json", '{"a": 1}'],
    ["jsx", "const a = <div />;"],
    ["tsx", "const a: number = 1;"],
  ])("演習の提出言語 %s のコードフェンスがハイライトされる", (language, code) => {
    const content = `\`\`\`${language}\n${code}\n\`\`\``;

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain(`class="hljs language-${language}"`);
    expect(html).toMatch(/hljs-[a-z]/);
  });

  it("xmlはhtmlの別名としてハイライトされる", () => {
    const content = '```xml\n<a href="x">y</a>\n```';

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain('class="hljs language-xml"');
    expect(html).toContain("hljs-tag");
  });

  it("広い表は表要素の中で横スクロールできるよう包み、コードフェンスの pre もスクロールポートを持つ", () => {
    const content = [
      "| a | b |",
      "| --- | --- |",
      "| very-long-cell-value | another-long-cell-value |",
      "",
      "```javascript",
      "const a = 1;",
      "```",
    ].join("\n");

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain('<div class="markdown-table-scroll"><table>');
    expect(html).toMatch(/<pre class="[^"]*\boverflow-x-auto\b[^"]*">/);
    expect(html).toContain('class="hljs language-javascript"');
  });

  it("インラインコードにはハイライトのクラスが付与されず、コードブロックと区別される", () => {
    const content = "`const a = 1;`\n\n```javascript\nconst a = 1;\n```";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toMatch(/<code>const a = 1;<\/code>/);
    expect(html).toContain('class="hljs language-javascript"');
  });

  it("指定なしの Markdown 画像は既定の最大幅・中央寄せで描画される", () => {
    const content = "![図](https://example.com/a.png)";

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toMatch(/<img[^>]*src="https:\/\/example\.com\/a\.png"/);
    expect(html).toMatch(/\bmx-auto\b/);
    expect(html).toContain(`max-width:min(100%, ${MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX}px)`);
    expect(html).not.toMatch(/title=/);
  });

  it("title の w=数値 で幅を指定でき、title 属性は残らない", () => {
    const content = '![図](https://example.com/a.png "w=400")';

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain("width:400px");
    expect(html).toContain("max-width:100%");
    expect(html).not.toMatch(/title=/);
  });

  it("不正な w= 指定は既定幅に落ち、title も残らない", () => {
    const content = '![図](https://example.com/a.png "w=abc")';

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain(`max-width:min(100%, ${MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX}px)`);
    expect(html).not.toContain("width:abc");
    expect(html).not.toMatch(/title=/);
  });

  it("通常の title はツールチップ用に残り、幅は既定", () => {
    const content = '![図](https://example.com/a.png "キャプション")';

    const html = renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

    expect(html).toContain('title="キャプション"');
    expect(html).toContain(`max-width:min(100%, ${MARKDOWN_IMAGE_DEFAULT_MAX_WIDTH_PX}px)`);
  });
});
