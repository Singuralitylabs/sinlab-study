import type { CodeFile } from "@/app/types";

/** Languages the in-browser preview renders; anything else needs a server-side runtime. */
export const PREVIEW_LANGUAGES = ["html", "css", "javascript"] as const;
export type PreviewLanguage = (typeof PREVIEW_LANGUAGES)[number];

const EXTENSION_LANGUAGE: Record<string, PreviewLanguage> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
};

export function isPreviewLanguage(language: string | null | undefined): boolean {
  return PREVIEW_LANGUAGES.includes(language as PreviewLanguage);
}

/** Stored language wins; the extension only fills in when a file has no language recorded. */
function resolveFileLanguage(file: CodeFile): PreviewLanguage | null {
  const language = file.language.trim().toLowerCase();
  if (language) {
    return isPreviewLanguage(language) ? (language as PreviewLanguage) : null;
  }
  const ext = file.filename.trim().toLowerCase().split(".").pop() ?? "";
  return EXTENSION_LANGUAGE[ext] ?? null;
}

/** True when every file is previewable, so a mixed submission (e.g. SQL + HTML) shows no preview. */
export function canPreviewFiles(files: readonly CodeFile[]): boolean {
  return files.length > 0 && files.every((file) => resolveFileLanguage(file) !== null);
}

// Content is inlined into <style>/<script>; a literal closing tag would end the element early and
// let the remainder render as markup.
function escapeClosingTag(content: string, tag: "style" | "script"): string {
  const escaped = content.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
  // "<!--" followed by "<script" puts the HTML parser in the "double escaped" state, where the
  // closing tag no longer ends the element.
  return tag === "script" ? escaped.replace(/<!--/g, "<\\!--") : escaped;
}

function normalizeRef(ref: string): string {
  return ref.trim().replace(/^\.\//, "");
}

function getAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function isRelativeRef(ref: string): boolean {
  // Absolute URLs, protocol-relative URLs and root paths are external; only bare names match files.
  return ref !== "" && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(ref);
}

function findFile(files: readonly CodeFile[], ref: string): CodeFile | undefined {
  const name = normalizeRef(ref);
  return files.find((file) => file.filename.trim() === name);
}

interface ScanGroups {
  raw?: string;
  scriptAttrs?: string;
  scriptBody?: string;
  element?: string;
}

// Branch order matters: comment, doctype and bogus comment ("<?xml ...?>", "<![CDATA[") all start
// with "<!" or "<?" and the first two must win. <title> / <textarea> are raw text like <style>, so
// a "<head>" inside them is not the element.
// Every branch may also end at the end of the document (an unclosed comment, tag or element, as
// the browser reads it). Otherwise each unclosed "<head" / "<link" / "<!--" would rescan to the
// end before failing: quadratic in the length, freezing whoever opens the submission.
// Comments end where the browser ends them, including the abrupt "<!-->" / "<!--->" and the
// incorrectly closed "--!>", so a typo there does not swallow the rest of the document.
const SCAN =
  /<!--(?:>|->|[\s\S]*?(?:--!?>|$))|<!doctype[^>]*(?:>|$)|<[!?][^>]*(?:>|$)|<(?<raw>style|title|textarea)\b[^>]*(?:>[\s\S]*?(?:<\/\k<raw>\s*>|$)|$)|<script\b(?<scriptAttrs>[^>]*)(?:>(?<scriptBody>[\s\S]*?)(?:<\/script\s*>|$)|$)|<link\b[^>]*(?:>|$)|<\/body\s*>|<(?<element>head|body)\b[^>]*(?:>|$)/gi;

/** False for a scan match that ran to the end of the document without its terminator. */
function isClosed(match: string): boolean {
  if (match.startsWith("<!--")) {
    return match.endsWith("-->") || match.endsWith("--!>");
  }
  const raw = /^<(script|style|title|textarea)\b/i.exec(match);
  if (raw) {
    return new RegExp(`</${raw[1]}\\s*>$`, "i").test(match);
  }
  return match.endsWith(">");
}

/**
 * Builds one HTML document from a submission's files. Same-name references (`<link
 * rel="stylesheet" href="style.css">`, `<script src="main.js">`) are inlined because the sandboxed
 * srcDoc iframe has no URL to resolve relative paths against; other references stay untouched.
 * `headPrelude` (the console bridge) must run before any of the learner's scripts: it goes right
 * after a <head> that precedes every <script> and <body>, else right after a leading doctype, else
 * at the very start. A srcdoc document never enters quirks mode either way, but a doctype that
 * comes after a script is dropped, which would leave the learner's document.doctype null.
 */
export function buildPreviewDocument(
  files: readonly CodeFile[],
  { headPrelude = "" }: { headPrelude?: string } = {}
): string {
  const base =
    files.find((f) => f.filename.trim().toLowerCase() === "index.html") ??
    files.find((f) => resolveFileLanguage(f) === "html");

  if (!base) {
    const css = files.filter((f) => resolveFileLanguage(f) === "css");
    const js = files.filter((f) => resolveFileLanguage(f) === "javascript");
    const styles = css.map((f) => `<style>${escapeClosingTag(f.content, "style")}</style>`);
    const scripts = js.map((f) => `<script>${escapeClosingTag(f.content, "script")}</script>`);
    return `<!doctype html><html><head><meta charset="utf-8">${headPrelude}${styles.join("")}</head><body>${scripts.join("")}</body></html>`;
  }

  // One left-to-right pass so context is respected: comments and inline <script>/<style> bodies are
  // matched as a whole and left alone, so a commented-out <link>/<script src> or a tag inside a JS
  // string is not expanded (the browser would not load it either).
  // Inlining drops src, so defer would be lost and the script would run before the DOM exists;
  // deferred scripts are moved to the end of the document instead (module scripts defer natively).
  // The same pass places headPrelude and finds </body>, so a "<head>" or "</body>" inside a comment,
  // a style or a script string is never taken for the element (an inserted </script> would end the
  // learner's script early, and a script inserted into a comment never runs).
  const source = base.content;
  const deferred: string[] = [];
  let preludePlaced = headPrelude === "";
  let preludeSearchOpen = true;
  const transform = (match: string, groups: ScanGroups): string => {
    if (match.startsWith("</")) {
      preludeSearchOpen = false;
      return match;
    }
    if (match.startsWith("<!") || match.startsWith("<?") || groups.raw !== undefined) {
      return match;
    }

    if (groups.element !== undefined) {
      const isHead = groups.element.toLowerCase() === "head" && match.endsWith(">");
      if (preludeSearchOpen && !preludePlaced && isHead) {
        preludePlaced = true;
        return match + headPrelude;
      }
      preludeSearchOpen = false;
      return match;
    }

    if (groups.scriptAttrs !== undefined) {
      preludeSearchOpen = false;
      const tag = `<script${groups.scriptAttrs}>`;
      const src = getAttribute(tag, "src");
      if (
        !isClosed(match) ||
        src === null ||
        groups.scriptBody?.trim() !== "" ||
        !isRelativeRef(src)
      ) {
        return match;
      }
      const file = findFile(files, src);
      if (!file) {
        return match;
      }
      const isModule = getAttribute(tag, "type")?.toLowerCase() === "module";
      const inlined = `<script${isModule ? ' type="module"' : ""}>${escapeClosingTag(file.content, "script")}</script>`;
      if (!isModule && /\sdefer(\s|=|>|\/)/i.test(tag)) {
        deferred.push(inlined);
        return "";
      }
      return inlined;
    }

    const rel = getAttribute(match, "rel");
    const href = getAttribute(match, "href");
    if (
      !match.endsWith(">") ||
      rel?.toLowerCase() !== "stylesheet" ||
      href === null ||
      !isRelativeRef(href)
    ) {
      return match;
    }
    const file = findFile(files, href);
    return file ? `<style>${escapeClosingTag(file.content, "style")}</style>` : match;
  };

  // A leading doctype (after only whitespace and comments) is found in this same pass, not by a
  // second regex over the preamble: that one needed a backtracking frame per character and, on a
  // few MB of leading comments, lost the doctype in Safari and threw RangeError in Chrome.
  let inPreamble = true;
  let afterDoctype = -1;
  let bodyEnd = -1;
  let unclosedTail = -1;
  let expanded = "";
  let lastEnd = 0;
  for (const m of source.matchAll(SCAN)) {
    const match = m[0];
    const gap = source.slice(lastEnd, m.index);
    if (inPreamble && !/^\s*$/.test(gap)) {
      inPreamble = false;
    }
    expanded += gap;
    if (inPreamble && afterDoctype === -1 && /^<!doctype[^>]*>$/i.test(match)) {
      afterDoctype = expanded.length + match.length;
    }
    // The tree builder ignores comments (bogus ones such as "<?xml ...?>" included) before the
    // doctype, so they keep the preamble open.
    if (inPreamble && !/^<(?:\?|!(?!doctype))/i.test(match)) {
      inPreamble = false;
    }
    if (bodyEnd === -1 && match.startsWith("</")) {
      bodyEnd = expanded.length;
    }
    lastEnd = m.index + match.length;
    // Anything appended after an unclosed construct would become its text (or attributes) and
    // never run, so deferred scripts go in front of it.
    if (lastEnd === source.length && !isClosed(match)) {
      unclosedTail = expanded.length;
    }
    expanded += transform(match, m.groups ?? {});
  }
  expanded += source.slice(lastEnd);

  const preludeAt = preludePlaced ? -1 : afterDoctype === -1 ? 0 : afterDoctype;
  const withPrelude =
    preludeAt === -1
      ? expanded
      : expanded.slice(0, preludeAt) + headPrelude + expanded.slice(preludeAt);
  if (deferred.length === 0) {
    return withPrelude;
  }
  let deferAt = bodyEnd !== -1 ? bodyEnd : unclosedTail !== -1 ? unclosedTail : expanded.length;
  if (preludeAt !== -1 && deferAt >= preludeAt) {
    deferAt += headPrelude.length;
  }
  return withPrelude.slice(0, deferAt) + deferred.join("") + withPrelude.slice(deferAt);
}
