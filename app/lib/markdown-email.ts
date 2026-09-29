/**
 * Converts an announcement's Markdown body to plain text and simple HTML for email. A small
 * converter covering only what mail clients need (paragraphs, line breaks, headings,
 * bullet/numbered lists, code blocks, bold, inline code, links) with no added dependency. The HTML
 * version escapes all body text, including the inside of matched decorations, so raw HTML in the
 * body isn't rendered (same policy as the in-app react-markdown). Only http:// and https:// URLs
 * become <a>; others (javascript: etc.) stay as text. The body is entered in the admin screen and
 * converted inside the cron send, so any input must finish in time roughly proportional to line
 * length (excessive regex backtracking must not stall the cron). Trailing # of headings is stripped
 * without regex, and inline decoration matching caps how many characters one match reads.
 */

import { escapeHtml } from "@/app/lib/escape-html";

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; start: number; items: string[] }
  | { type: "code"; lines: string[] };

const HEADING_PREFIX = /^ {0,3}#{1,6}[ \t]+/;
// Match only the line-start marker and take the item text from the match position to end of line by
// slice (a `\s+(.*)$` form takes quadratic time in the number of spaces on lines with long
// whitespace runs).
const UNORDERED_PREFIX = /^[ \t]*[-*+][ \t]+/;
const ORDERED_PREFIX = /^[ \t]*(\d{1,9})[.)][ \t]+/;
const FENCE = /^\s*```/;

/**
 * Returns the heading text (closing # and whitespace removed) for a heading line, else null.
 * Trailing handling avoids regex (a form like `(.*?)\s*#*\s*$` backtracks cubically in the number
 * of spaces on lines with long whitespace runs).
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
  // Strip a closing # only after whitespace (or when the heading is only #), keeping things like
  // `C#`.
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
      // Numbered lists start from the first item's number (same as in-app react-markdown).
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
 * Match inline decorations (inline code, links, bold) in a single scan. Substituting them one after
 * another would apply later substitutions inside the attributes of an already-built `<a
 * href="...">` or inside code, corrupting HTML/URLs, so no other decoration is applied inside a
 * matched range. Cap the characters read per match (even lines full of unclosed `[` / `**` / `` `
 * `` stop each scan at the cap, so time stays roughly proportional to line length).
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

/**
 * Body already converted for email (only creatable via renderEmailMarkdown(), so arbitrary HTML
 * can't be passed in).
 */
export type EmailMarkdown = {
  readonly text: string;
  readonly html: string;
  readonly __brand: "EmailMarkdown";
};

/** Builds text and simple HTML together (a broadcast calls it once per announcement). */
export function renderEmailMarkdown(markdown: string): EmailMarkdown {
  return {
    text: markdownToEmailText(markdown),
    html: markdownToEmailHtml(markdown),
    __brand: "EmailMarkdown",
  };
}
