/**
 * お知らせの Markdown 本文を、メール用のプレーンテキストと簡易 HTML に変換する。
 *
 * メールクライアントでの表示に必要な範囲（段落・改行・見出し・箇条書き・番号付きリスト・
 * コードブロック・太字・インラインコード・リンク）だけを扱う小さな変換で、依存を追加しない。
 * HTML は必ず先に全文をエスケープしてから変換するため、本文中の生 HTML は描画されない
 * （アプリ内表示の react-markdown が生 HTML を描画しないのと同じ方針）。リンクは
 * `http://` / `https://` の URL だけを `<a>` にし、それ以外（`javascript:` 等）は文字のまま残す。
 */

import { escapeHtml } from "@/app/lib/escape-html";

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; lines: string[] };

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const UNORDERED_ITEM = /^\s*[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^\s*```/;

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

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", text: heading[1] });
      continue;
    }

    const unordered = UNORDERED_ITEM.exec(line);
    const ordered = unordered ? null : ORDERED_ITEM.exec(line);
    const item = unordered ?? ordered;
    if (item) {
      const isOrdered = ordered !== null;
      if (paragraph.length > 0 || (list && list.ordered !== isOrdered)) {
        flush();
      }
      list ??= { ordered: isOrdered, items: [] };
      list.items.push(item[1]);
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

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BOLD = /\*\*(.+?)\*\*/g;
const INLINE_CODE = /`([^`]+)`/g;

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
