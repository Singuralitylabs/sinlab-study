import { describe, expect, it } from "vitest";
import { markdownToEmailHtml, markdownToEmailText } from "@/app/lib/markdown-email";

const sample = [
  "# もくもく会",
  "",
  "10月の**もくもく会**です。",
  "2行目です。",
  "",
  "- 日時: 10/20",
  "- 場所: [オンライン](https://example.com/room?a=1&b=2)",
  "",
  "1. 申し込む",
  "2. 参加する",
  "",
  "```",
  "const a = 1 < 2;",
  "```",
].join("\n");

describe("markdownToEmailText", () => {
  it("見出し・箇条書き・番号付きリスト・リンク・太字を読みやすいテキストにする", () => {
    const text = markdownToEmailText(sample);

    expect(text).toContain("■ もくもく会");
    expect(text).toContain("10月のもくもく会です。\n2行目です。");
    expect(text).toContain("・ 日時: 10/20");
    expect(text).toContain("・ 場所: オンライン（https://example.com/room?a=1&b=2）");
    expect(text).toContain("1. 申し込む\n2. 参加する");
    expect(text).toContain("const a = 1 < 2;");
    expect(text).not.toContain("**");
    expect(text).not.toContain("```");
  });
});

describe("markdownToEmailHtml", () => {
  const html = markdownToEmailHtml(sample);

  it("段落・見出し・リスト・コードブロック・太字・リンクを簡易 HTML にする", () => {
    expect(html).toContain("もくもく会</p>");
    expect(html).toContain("10月の<strong>もくもく会</strong>です。<br>2行目です。");
    expect(html).toMatch(
      /<ul[^>]*><li>日時: 10\/20<\/li><li>場所: <a href="https:\/\/example\.com\/room\?a=1&amp;b=2"/
    );
    expect(html).toMatch(/<ol[^>]*><li>申し込む<\/li><li>参加する<\/li><\/ol>/);
    expect(html).toContain("const a = 1 &lt; 2;</pre>");
  });

  it("本文中の生 HTML は描画せずエスケープする", () => {
    const escaped = markdownToEmailHtml('<script>alert(1)</script>\n\n<img src=x onerror="a">');
    expect(escaped).not.toContain("<script>");
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("http(s) 以外の URL はリンクにしない", () => {
    const unsafe = markdownToEmailHtml(
      "[押す](javascript:alert(1)) [メール](mailto:a@example.com)"
    );
    expect(unsafe).not.toContain("<a ");
    expect(unsafe).toContain("[押す](javascript:alert(1))");
  });

  it("リンク文字列・URL に含まれる記号もエスケープされたまま属性に入る", () => {
    const quoted = markdownToEmailHtml('[a"b](https://example.com/?q="x")');
    expect(quoted).toContain('href="https://example.com/?q=&quot;x&quot;"');
    expect(quoted).toContain(">a&quot;b</a>");
  });
});
