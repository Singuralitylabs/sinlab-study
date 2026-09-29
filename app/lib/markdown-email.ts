/**
 * お知らせの Markdown 本文を、メール用のプレーンテキストと簡易 HTML に変換する。
 *
 * メールクライアントでの表示に必要な範囲（段落・改行・見出し・箇条書き・番号付きリスト・
 * コードブロック・太字・インラインコード・リンク）だけを扱う小さな変換で、依存を追加しない。
 * HTML は必ず先に全文をエスケープしてから変換するため、本文中の生 HTML は描画されない
 * （アプリ内表示の react-markdown が生 HTML を描画しないのと同じ方針）。リンクは
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
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; lines: string[] };

const HEADING_PREFIX = /^ {0,3}#{1,6}[ \t]+/;
// 行頭の記号だけを照合し、項目の本文は一致位置から行末までを slice で取る
// （`\s+(.*)$` の形は空白が長く続く行で空白の数の2乗の時間がかかるため）
const UNORDERED_PREFIX = /^[ \t]*[-*+][ \t]+/;
const ORDERED_PREFIX = /^[ \t]*\d{1,9}[.)][ \t]+/;
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
  let list: { ordered: boolean; items: string[] } | null = null;

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
      list ??= { ordered: isOrdered, items: [] };
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

// 1回の照合で読む文字数に上限を付ける（閉じ記号の無い `[` / `**` / `` ` `` が大量に並ぶ行でも、
// 各位置からの走査が上限で止まり、行の長さにほぼ比例する時間で終わる）
const LINK = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]{1,2000})\)/g;
const BOLD = /\*\*([^*\n]{1,300})\*\*/g;
const INLINE_CODE = /`([^`\n]{1,300})`/g;

function inlineToText(value: string): string {
  return value.replace(LINK, "$1（$2）").replace(BOLD, "$1").replace(INLINE_CODE, "$1");
}

/** エスケープ済みの文字列に、インラインの装飾を適用する */
function inlineToHtml(escaped: string): string {
  return escaped
    .replace(LINK, '<a href="$2" style="color:#2563eb;">$1</a>')
    .replace(BOLD, "<strong>$1</strong>")
    .replace(
      INLINE_CODE,
      '<code style="background:#f4f4f5;padding:0 4px;border-radius:4px;">$1</code>'
    );
}

/** プレーンテキスト版（Markdown の記号を読みやすい形に落とす） */
export function markdownToEmailText(markdown: string): string {
  return parseBlocks(markdown)
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `■ ${inlineToText(block.text)}`;
        case "list":
          return block.items
            .map((item, index) => `${block.ordered ? `${index + 1}.` : "・"} ${inlineToText(item)}`)
            .join("\n");
        case "code":
          return block.lines.join("\n");
        default: // paragraph
          return block.lines.map(inlineToText).join("\n");
      }
    })
    .join("\n\n");
}

/** 簡易 HTML 版（全文をエスケープしてから変換する） */
export function markdownToEmailHtml(markdown: string): string {
  return parseBlocks(markdown)
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `<p style="margin:0 0 12px;font-weight:bold;font-size:15px;">${inlineToHtml(escapeHtml(block.text))}</p>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          const items = block.items
            .map((item) => `<li>${inlineToHtml(escapeHtml(item))}</li>`)
            .join("");
          return `<${tag} style="margin:0 0 16px;padding-left:20px;">${items}</${tag}>`;
        }
        case "code":
          return `<pre style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:6px;white-space:pre-wrap;font-size:13px;">${escapeHtml(block.lines.join("\n"))}</pre>`;
        default: // paragraph
          return `<p style="margin:0 0 16px;">${block.lines.map((line) => inlineToHtml(escapeHtml(line))).join("<br>")}</p>`;
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
