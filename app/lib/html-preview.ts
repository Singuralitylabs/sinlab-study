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
  link?: string;
  element?: string;
  template?: string;
}

// Elements whose content the tokenizer does not read as markup (scripting is on in the preview, so
// <noscript> is one too). A "<head>" or <link> inside them is not an element.
const RAW_TEXT = "style|title|textarea|xmp|noscript|noembed|noframes|iframe";
// A tag name runs to HTML whitespace, "/" or ">", so "<head-x>" or "<style-x>" is another element
// (\b would stop at "-"). JS \s is wider than HTML whitespace (it includes \v and NBSP).
const NAME_END = String.raw`(?=[\t\n\f\r />]|$)`;
// Every tag is consumed up to its ">", so a "<head>" or "<link" in an attribute value is not
// taken for markup. Quoted values are not read as a whole (a ">" inside one ends the tag early):
// a loop over quoted-or-plain alternatives costs JavaScriptCore a backtracking frame per character
// and on a long tag it silently finds no match at all.
const ATTRS = "[^>]*";
// An end tag ends at whitespace, "/" or ">" after its name ("</script foo>" closes the script).
const endTag = (name: string) => String.raw`<\/${name}(?:[\t\n\f\r /][^>]*)?(?:>|$)`;

// Branch order matters: comment, doctype and bogus comment ("<?xml ...?>", "<![CDATA[", "</ x")
// overlap and the first two must win; the catch-all tag branch comes last.
// Every branch may also end at the end of the document (an unclosed comment, tag or element, as
// the browser reads it). Otherwise each unclosed "<head" / "<link" / "<!--" would rescan to the
// end before failing: quadratic in the length, freezing whoever opens the submission.
// Comments end where the browser ends them, including the abrupt "<!-->" / "<!--->" and the
// incorrectly closed "--!>", so a typo there does not swallow the rest of the document.
const SCAN = new RegExp(
  [
    String.raw`<!--(?:>|->|[\s\S]*?(?:--!?>|$))`,
    String.raw`<!doctype[^>]*(?:>|$)`,
    String.raw`<(?:[!?]|\/(?![a-z>]))[^>]*(?:>|$)`,
    String.raw`<plaintext${NAME_END}[\s\S]*`,
    String.raw`<(?<raw>${RAW_TEXT})${NAME_END}${ATTRS}(?:>[\s\S]*?(?:${endTag(String.raw`\k<raw>`)}|$)|$)`,
    // Only the start tag: the body is found by findScriptEnd(), which a regex cannot follow.
    String.raw`<script${NAME_END}(?<scriptAttrs>${ATTRS})(?:>|$)`,
    String.raw`<(?<link>link)${NAME_END}${ATTRS}(?:>|$)`,
    String.raw`<(?<element>head|body)${NAME_END}${ATTRS}(?:>|$)`,
    String.raw`<(?<template>\/?template)${NAME_END}${ATTRS}(?:>|$)`,
    String.raw`<\/?[a-z][^\t\n\f\r />]*${ATTRS}(?:>|$)`,
  ].join("|"),
  "gi"
);

const RAW_START = new RegExp(String.raw`^<(plaintext|${RAW_TEXT})${NAME_END}`, "i");

const SCRIPT_TOKENS = /<!--|-->|<(\/?)script(?=[\t\n\f\r />])/gi;
const DASHES_THEN_GT = /-*>/y;
const END_TAG_REST = /[^>]*(?:>|$)/y;

/**
 * Finds where an inline script's body ends, following the tokenizer's script data states: after
 * "<!--", a "<script" makes the next "</script" part of the text ("double escaped"), so old-style
 * `<!-- document.write("<script></script>") -->` code does not end there. Matching on the first
 * "</script" instead would read the rest of the learner's JavaScript as markup and inline or
 * insert scripts into it. Steps from token to token, so it is linear and needs no regex
 * backtracking (which JavaScriptCore cannot afford on long inputs).
 */
function findScriptEnd(
  source: string,
  from: number
): { bodyEnd: number; end: number; closed: boolean } {
  let state: "data" | "escaped" | "double" = "data";
  SCRIPT_TOKENS.lastIndex = from;
  for (let t = SCRIPT_TOKENS.exec(source); t; t = SCRIPT_TOKENS.exec(source)) {
    const after = t.index + t[0].length;
    if (t[0] === "<!--") {
      if (state === "data") {
        // "<!-->" and "<!--->" open and close at once.
        DASHES_THEN_GT.lastIndex = after;
        if (DASHES_THEN_GT.test(source)) {
          SCRIPT_TOKENS.lastIndex = DASHES_THEN_GT.lastIndex;
        } else {
          state = "escaped";
        }
      } else {
        // Outside the data state "<!" is plain text; its dashes may still start a "-->".
        SCRIPT_TOKENS.lastIndex = t.index + 2;
      }
    } else if (t[0] === "-->") {
      state = "data";
    } else if (t[1] === "/") {
      if (state === "double") {
        state = "escaped";
      } else {
        END_TAG_REST.lastIndex = after;
        END_TAG_REST.test(source);
        const end = END_TAG_REST.lastIndex;
        return { bodyEnd: t.index, end, closed: source[end - 1] === ">" };
      }
    } else if (state === "escaped") {
      state = "double";
    }
  }
  return { bodyEnd: source.length, end: source.length, closed: false };
}

/** False for a scan match that ran to the end of the document without its terminator. */
function isClosed(match: string): boolean {
  if (match.startsWith("<!--")) {
    return match.endsWith("-->") || match.endsWith("--!>");
  }
  const raw = RAW_START.exec(match);
  if (raw?.[1].toLowerCase() === "plaintext") {
    return false;
  }
  if (raw) {
    // Only the last end tag is tested: an unanchored search would rescan from every "</name"
    // in the body, quadratic on a long unclosed element.
    const name = raw[1].toLowerCase();
    const last = match.toLowerCase().lastIndexOf(`</${name}`);
    return (
      last !== -1 &&
      new RegExp(String.raw`^<\/${name}(?:[\t\n\f\r /][^>]*)?>$`, "i").test(match.slice(last))
    );
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
  // deferred scripts are moved to the end of the document instead (module scripts defer natively),
  // not before </body>: the browser runs them after the whole document is parsed, so elements
  // written after </body> exist by then too.
  // The same pass places headPrelude, so a "<head>" inside a comment, a style or a script string is
  // never taken for the element (an inserted </script> would end the learner's script early).
  const source = base.content;
  const deferred: string[] = [];
  let preludePlaced = headPrelude === "";
  let preludeSearchOpen = true;
  const transform = (match: string, groups: ScanGroups, closed: boolean): string => {
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
      if (!closed || src === null || groups.scriptBody?.trim() !== "" || !isRelativeRef(src)) {
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

    if (groups.link === undefined) {
      return match;
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
  let unclosedTail = -1;
  // <template> content is parsed as markup (so it is scanned, not skipped like raw text) but is
  // inert: nothing inside may be inlined, moved out and run, or taken for <head>.
  let templateDepth = 0;
  let templateAt = -1;
  let expanded = "";
  let lastEnd = 0;
  const scan = new RegExp(SCAN);
  for (let m = scan.exec(source); m; m = scan.exec(source)) {
    let match = m[0];
    const groups: ScanGroups = { ...m.groups };
    let closed: boolean;
    if (groups.scriptAttrs !== undefined && match.endsWith(">")) {
      const body = findScriptEnd(source, m.index + match.length);
      groups.scriptBody = source.slice(m.index + match.length, body.bodyEnd);
      match = source.slice(m.index, body.end);
      scan.lastIndex = body.end;
      closed = body.closed;
    } else {
      closed = isClosed(match);
    }
    const gap = source.slice(lastEnd, m.index);
    // The tokenizer drops "</>" without emitting anything, so it keeps the preamble open too.
    if (inPreamble && !/^\s*$/.test(gap.replaceAll("</>", ""))) {
      inPreamble = false;
    }
    expanded += gap;
    if (inPreamble && afterDoctype === -1 && /^<!doctype[^>]*>$/i.test(match)) {
      afterDoctype = expanded.length + match.length;
    }
    // The tree builder ignores comments (bogus ones such as "<?xml ...?>" or "</ x>" included)
    // before the doctype, so they keep the preamble open.
    if (inPreamble && !/^<(?:\?|!(?!doctype)|\/(?![a-z>]))/i.test(match)) {
      inPreamble = false;
    }
    const inTemplate = templateDepth > 0;
    if (groups.template !== undefined && match.endsWith(">")) {
      if (!groups.template.startsWith("/")) {
        templateAt = templateDepth === 0 ? expanded.length : templateAt;
        templateDepth++;
      } else if (templateDepth > 0) {
        templateDepth--;
      }
    }
    lastEnd = m.index + match.length;
    // Anything appended after an unclosed construct would become its text (or attributes) and
    // never run, so deferred scripts go in front of it.
    if (lastEnd === source.length && !closed) {
      unclosedTail = expanded.length;
    }
    expanded += inTemplate ? match : transform(match, groups, closed);
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
  // An unclosed <template> runs to the end, so anything appended would be inert.
  const endAt = templateDepth > 0 ? templateAt : unclosedTail;
  let deferAt = endAt !== -1 ? endAt : expanded.length;
  if (preludeAt !== -1 && deferAt >= preludeAt) {
    deferAt += headPrelude.length;
  }
  return withPrelude.slice(0, deferAt) + deferred.join("") + withPrelude.slice(deferAt);
}
