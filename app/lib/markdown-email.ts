/**
 * お知らせの Markdown 本文を、メール用のプレーンテキストと簡易 HTML に変換する。
 *
 * メールクライアントでの表示に必要な範囲（段落・改行・見出し・箇条書き・番号付きリスト・
 * コードブロック・太字・インラインコード・リンク）だけを扱う小さな変換で、依存を追加しない。
 * HTML 版では、装飾として照合した部分の中身も含めて本文の文字列をすべてエスケープしてから
 * 出力するため、本文中の生 HTML は描画されない（アプリ内表示の react-markdown が生 HTML を
 * 描画しないのと同じ方針）。リンクは
 * `http://` / `https://` の URL だけを `<a>` にし、それ以外（`javascript:` 等）は文字のまま残す。
 *
 * 本文は管理画面から入力され、Cron の送信処理の中で変換するため、どんな入力でも行の長さに
 * ほぼ比例する時間で終わるようにする（正規表現の過剰なバックトラックで Cron を止めない）。
 * 見出しの末尾の `#` の除去は正規表現を使わずに行い、インラインの装飾は1回の照合で読む
 * 文字数に上限を付ける。
 */

import { escapeHtml } from "@/app/lib/escape-html";

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; start: number; items: string[] }
  | { type: "code"; lines: string[] };

const HEADING_PREFIX = /^ {0,3}#{1,6}[ \t]+/;
// 行頭の記号だけを照合し、項目の本文は一致位置から行末までを slice で取る
// （`\s+(.*)$` の形は空白が長く続く行で空白の数の2乗の時間がかかるため）
const UNORDERED_PREFIX = /^[ \t]*[-*+][ \t]+/;
const ORDERED_PREFIX = /^[ \t]*(\d{1,9})[.)][ \t]+/;
const FENCE = /^\s*```/;

/**
 * 見出し行なら見出しの文字列（末尾の閉じ `#` と空白を除く）を返す。見出しでなければ null。
 * 末尾の処理は正規表現を使わずに行う（`(.*?)\s*#*\s*$` のような形は、空白が長く続く行で
 * バックトラックが空白の数の3乗に比例して膨らむため）
 */
function parseHeading(line: string): string | null {
  const prefix = HEADING_PREFIX.exec(line);
  if (!prefix) {
    return null;
  }
  const text = line.slice(prefix[0].length).trimEnd();
  let end = text.length;
  while (end > 0 && text[end - 1] === "#") {
    end--;
  }
  // 閉じの `#` は、空白の後（または見出しが `#` だけ）のときだけ取り除く（`C#` などは残す）
  if (end < text.length && (end === 0 || text[end - 1] === " " || text[end - 1] === "\t")) {
    return text.slice(0, end).trimEnd();
  }
  return text;
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraph });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: "list", ...list });
      list = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) {
        code.push(lines[i]);
      }
      blocks.push({ type: "code", lines: code });
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    const heading = parseHeading(line);
    if (heading !== null) {
      flush();
      blocks.push({ type: "heading", text: heading });
      continue;
    }

    const unordered = UNORDERED_PREFIX.exec(line);
    const ordered = unordered ? null : ORDERED_PREFIX.exec(line);
    const itemPrefix = unordered ?? ordered;
    if (itemPrefix) {
      const isOrdered = ordered !== null;
      if (paragraph.length > 0 || (list && list.ordered !== isOrdered)) {
        flush();
      }
      // 番号付きリストは最初の項目の番号から数える（アプリ内の react-markdown と同じ）
      list ??= { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
      list.items.push(line.slice(itemPrefix[0].length));
      continue;
    }

    if (list) {
      flush();
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

/**
 * インラインの装飾（インラインコード・リンク・太字）を1回の走査で同時に照合する。
 * 別々に順番に置換すると、先に作った `<a href="...">` の属性値やコードの中身にまで後段の
 * 置換がかかって HTML・URL が壊れるため、照合した範囲の中身には他の装飾を適用しない。
 * 1回の照合で読む文字数に上限を付ける（閉じ記号の無い `[` / `**` / `` ` `` が大量に並ぶ行でも、
 * 各位置からの走査が上限で止まり、行の長さにほぼ比例する時間で終わる）。
 */
const INLINE =
  /`([^`\n]{1,300})`|\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]{1,2000})\)|\*\*([^*\n]{1,300})\*\*/g;

function renderInline(raw: string, format: "text" | "html"): string {
  const plain = (value: string) => (format === "html" ? escapeHtml(value) : value);
  let output = "";
  let last = 0;
  for (const match of raw.matchAll(INLINE)) {
    output += plain(raw.slice(last, match.index));
    const [whole, code, linkText, linkUrl, bold] = match;
    if (code !== undefined) {
      output +=
        format === "html"
          ? `<code style="background:#f4f4f5;padding:0 4px;border-radius:4px;">${escapeHtml(code)}</code>`
          : code;
    } else if (linkText !== undefined && linkUrl !== undefined) {
      output +=
        format === "html"
          ? `<a href="${escapeHtml(linkUrl)}" style="color:#2563eb;">${escapeHtml(linkText)}</a>`
          : `${linkText}（${linkUrl}）`;
    } else {
      output += format === "html" ? `<strong>${escapeHtml(bold)}</strong>` : bold;
    }
    last = match.index + whole.length;
  }
  return output + plain(raw.slice(last));
}

/** プレーンテキスト版（Markdown の記号を読みやすい形に落とす） */
export function markdownToEmailText(markdown: string): string {
  return parseBlocks(markdown)
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `■ ${renderInline(block.text, "text")}`;
        case "list":
          return block.items
            .map(
              (item, index) =>
                `${block.ordered ? `${block.start + index}.` : "・"} ${renderInline(item, "text")}`
            )
            .join("\n");
        case "code":
          return block.lines.join("\n");
        default: // paragraph
          return block.lines.map((line) => renderInline(line, "text")).join("\n");
      }
    })
    .join("\n\n");
}

/** 簡易 HTML 版（照合しなかった部分・照合した中身はすべてエスケープする） */
export function markdownToEmailHtml(markdown: string): string {
  return parseBlocks(markdown)
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `<p style="margin:0 0 12px;font-weight:bold;font-size:15px;">${renderInline(block.text, "html")}</p>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
          const items = block.items
            .map((item) => `<li>${renderInline(item, "html")}</li>`)
            .join("");
          return `<${tag}${start} style="margin:0 0 16px;padding-left:20px;">${items}</${tag}>`;
        }
        case "code":
          return `<pre style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:6px;white-space:pre-wrap;font-size:13px;">${escapeHtml(block.lines.join("\n"))}</pre>`;
        default: // paragraph
          return `<p style="margin:0 0 16px;">${block.lines.map((line) => renderInline(line, "html")).join("<br>")}</p>`;
      }
    })
    .join("");
}

/** メール用に変換済みの本文（`renderEmailMarkdown()` でだけ作れる。任意の HTML を渡させない） */
export type EmailMarkdown = {
  readonly text: string;
  readonly html: string;
  readonly __brand: "EmailMarkdown";
};

/** テキスト版と簡易 HTML 版をまとめて作る（一斉送信では1件のお知らせにつき1回だけ呼ぶ） */
export function renderEmailMarkdown(markdown: string): EmailMarkdown {
  return {
    text: markdownToEmailText(markdown),
    html: markdownToEmailHtml(markdown),
    __brand: "EmailMarkdown",
  };
}
