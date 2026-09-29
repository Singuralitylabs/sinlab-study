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

  it("リンク先 URL の中の ` や ** には他の装飾をかけない（href を壊さない）", () => {
    const backtick = markdownToEmailHtml("[docs](https://example.com/a`b`c)");
    expect(backtick).toContain(
      '<a href="https://example.com/a`b`c" style="color:#2563eb;">docs</a>'
    );
    expect(backtick).not.toContain("<code");

    const stars = markdownToEmailHtml("[docs](https://example.com/**x**)");
    expect(stars).toContain('<a href="https://example.com/**x**"');
    expect(stars).not.toContain("<strong>");
  });

  it("インラインコードの中の ** やリンクは装飾しない", () => {
    const html = markdownToEmailHtml("`[a](https://x.com) **b**` と **太字**");
    expect(html).toContain(
      '<code style="background:#f4f4f5;padding:0 4px;border-radius:4px;">[a](https://x.com) **b**</code>'
    );
    expect(html).toContain("<strong>太字</strong>");
    expect(html.match(/<a /g)).toBeNull();
  });

  it("番号付きリストは最初の項目の番号から数える（アプリ内表示と同じ）", () => {
    expect(markdownToEmailHtml("5. five\n6. six")).toMatch(/<ol start="5"[^>]*><li>five<\/li>/);
    expect(markdownToEmailHtml("1. one")).toMatch(/<ol style=/);
    expect(markdownToEmailText("5. five\n6. six")).toBe("5. five\n6. six");
  });

  it("リンク文字列・URL に含まれる記号もエスケープされたまま属性に入る", () => {
    const quoted = markdownToEmailHtml('[a"b](https://example.com/?q="x")');
    expect(quoted).toContain('href="https://example.com/?q=&quot;x&quot;"');
    expect(quoted).toContain(">a&quot;b</a>");
  });
});

describe("悪意のある・壊れた入力でも短時間で終わる（Cron を止めない）", () => {
  const within = (fn: () => void, ms: number) => {
    const started = performance.now();
    fn();
    return performance.now() - started < ms;
  };

  it.each([
    ["見出しの途中に長い空白（半角）", `# a${" ".repeat(5000)}b`],
    ["見出しの途中に長い空白（全角）", `# a${"　".repeat(5000)}b`],
    ["閉じの無い [ が大量に並ぶ", "[".repeat(20_000)],
    ["閉じの無い ** が大量に並ぶ", "**".repeat(10_000)],
    ["閉じの無い ` が大量に並ぶ", "`".repeat(20_000)],
    ["リンクの途中で終わる", `[a](https://${"x".repeat(20_000)}`],
    ["箇条書きの記号の後に長い空白", `- ${" ".repeat(19_990)}x`],
    ["番号付きリストの記号の後に長い空白", `1. ${" ".repeat(19_990)}x`],
  ])("%s", (_label, input) => {
    expect(within(() => markdownToEmailText(input), 500)).toBe(true);
    expect(within(() => markdownToEmailHtml(input), 500)).toBe(true);
  });
});

describe("見出しの閉じ記号", () => {
  it("末尾の閉じ # と空白を取り除き、語の一部の # は残す", () => {
    expect(markdownToEmailText("## お知らせ ##  ")).toBe("■ お知らせ");
    expect(markdownToEmailText("# C#")).toBe("■ C#");
    expect(markdownToEmailText("#   ")).toBe("■ ");
  });
});
