import type { CodeFile } from "@/app/types";

/** Languages the in-browser preview renders; anything else needs a server-side runtime. */
export const PREVIEW_LANGUAGES = ["html", "css", "javascript"] as const;
export type PreviewLanguage = (typeof PREVIEW_LANGUAGES)[number];

const EXTENSION_LANGUAGE: Record<string, PreviewLanguage> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  // React exercises store JSX under the javascript language; the extension fills empty language.
  jsx: "javascript",
};

/** Served from `public/vendor/react/` (fixed versions). srcDoc must use absolute URLs (#475). */
export const PREVIEW_REACT_VENDOR_DIR = "/vendor/react";
const REACT_VENDOR_FILES = {
  react: "react.production.min.js",
  reactDom: "react-dom.production.min.js",
  babel: "babel.min.js",
  tailwind: "tailwind.browser.js",
} as const;

/** Tailwind v4 entry CSS (what create-next-app puts in globals.css); its presence turns Tailwind on. */
const TAILWIND_IMPORT = /@import\s+(?:url\()?\s*["']tailwindcss["']/;

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

/**
 * True when every file is a preview language (mixed SQL+HTML is false). Display uses
 * previewCapability(); this stays as the language-only gate for callers that do not need the
 * html / js / css layout rules.
 */
export function canPreviewFiles(files: readonly CodeFile[]): boolean {
  return files.length > 0 && files.every((file) => resolveFileLanguage(file) !== null);
}

export interface PreviewLayoutFile {
  filename?: string;
  language?: string | null;
}

/** What the admin may turn on, and what NULL (automatic) shows. */
export interface PreviewCapability {
  autoPreview: boolean;
  autoConsole: boolean;
  previewAllowed: boolean;
  consoleAllowed: boolean;
}

export interface PreviewDisplay {
  preview: boolean;
  console: boolean;
  /** No visible frame: the hidden iframe runs only after 実行, so typing cannot hang the tab. */
  manualRun: boolean;
}

export const PREVIEW_EXERCISE_ONLY_MESSAGE = "プレビューとコンソールの設定は演習だけに指定できます";
export const PREVIEW_NOT_ALLOWED_MESSAGE = "このファイル構成ではプレビューを表示できません";
export const CONSOLE_NOT_ALLOWED_MESSAGE = "このファイル構成ではコンソールを表示できません";

type PreviewLayoutKind = "html" | "javascript" | "css" | "js-css" | "react" | "other";

function fileExtension(filename: string): string {
  const name = filename.trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1);
}

const REACT_ENTRY_NAMES = ["App.jsx", "App.js"] as const;
// page.js alone is also the name of server-component exercises (fetch, next/*) that cannot render here,
// so it only counts as an entry beside a CSS file (the Tailwind starter's globals.css).
const NEXT_ENTRY_NAMES = ["page.jsx", "page.js"] as const;

/**
 * React layout (#475): must include App.jsx / App.js (or page.jsx / page.js beside a .css file, for
 * Tailwind exercises), and every file is only .jsx / .js / .css.
 * Checked before the language-based kinds so App.js is not classified as javascript-only.
 */
function isReactPreviewLayout(files: readonly PreviewLayoutFile[]): boolean {
  if (files.length === 0) {
    return false;
  }
  let hasApp = false;
  let hasNextPage = false;
  let hasCss = false;
  for (const file of files) {
    const name = (file.filename ?? "").trim();
    const ext = fileExtension(name);
    if (ext !== "js" && ext !== "jsx" && ext !== "css") {
      return false;
    }
    if ((REACT_ENTRY_NAMES as readonly string[]).includes(name)) {
      hasApp = true;
    }
    if ((NEXT_ENTRY_NAMES as readonly string[]).includes(name)) {
      hasNextPage = true;
    }
    if (ext === "css") {
      hasCss = true;
    }
  }
  return hasApp || (hasNextPage && hasCss);
}

/**
 * Admin layout (filename + language), not the language a learner picks in the form.
 * A file whose language is outside html/css/javascript makes the whole layout "other".
 */
function classifyPreviewLayout(files: readonly PreviewLayoutFile[]): PreviewLayoutKind {
  if (files.length === 0) {
    return "other";
  }
  if (isReactPreviewLayout(files)) {
    return "react";
  }
  let hasHtml = false;
  let hasCss = false;
  let hasJs = false;
  for (const file of files) {
    const language = resolveFileLanguage({
      filename: file.filename ?? "",
      language: file.language ?? "",
      content: "",
    });
    if (language === null) {
      return "other";
    }
    if (language === "html") {
      hasHtml = true;
    } else if (language === "css") {
      hasCss = true;
    } else {
      hasJs = true;
    }
  }
  if (hasHtml) {
    return "html";
  }
  if (hasJs && hasCss) {
    return "js-css";
  }
  if (hasJs) {
    return "javascript";
  }
  if (hasCss) {
    return "css";
  }
  return "other";
}

/**
 * Automatic rules (#380 / #351). CSS-only is off unless previewBaseHtml is set.
 * javascript+css has no page to preview, but the script can still run in the console.
 */
export function previewCapability(
  files: readonly PreviewLayoutFile[],
  options: { previewBaseHtml?: string | null } = {}
): PreviewCapability {
  const hasScaffold = Boolean(options.previewBaseHtml?.trim());
  switch (classifyPreviewLayout(files)) {
    case "html":
    case "react":
      return {
        autoPreview: true,
        autoConsole: true,
        previewAllowed: true,
        consoleAllowed: true,
      };
    case "css":
      return {
        autoPreview: hasScaffold,
        autoConsole: false,
        previewAllowed: hasScaffold,
        consoleAllowed: false,
      };
    case "javascript":
    case "js-css":
      return {
        autoPreview: false,
        autoConsole: true,
        previewAllowed: false,
        consoleAllowed: true,
      };
    default:
      return {
        autoPreview: false,
        autoConsole: false,
        previewAllowed: false,
        consoleAllowed: false,
      };
  }
}

/** Why an explicit true cannot be stored. false and null are always legal. */
export function previewSettingsError(input: {
  contentType?: string;
  files: readonly PreviewLayoutFile[];
  showPreview?: boolean | null;
  showConsole?: boolean | null;
  previewBaseHtml?: string | null;
}): string | null {
  const setsValue = input.showPreview != null || input.showConsole != null;
  if (input.contentType !== undefined && input.contentType !== "exercise") {
    return setsValue ? PREVIEW_EXERCISE_ONLY_MESSAGE : null;
  }
  const capability = previewCapability(input.files, {
    previewBaseHtml: input.previewBaseHtml,
  });
  if (input.showPreview === true && !capability.previewAllowed) {
    return PREVIEW_NOT_ALLOWED_MESSAGE;
  }
  if (input.showConsole === true && !capability.consoleAllowed) {
    return CONSOLE_NOT_ALLOWED_MESSAGE;
  }
  return null;
}

/**
 * NULL settings follow previewCapability(). A stored true that the layout no longer allows
 * stays off (the API rejects that save; this keeps a stale row from rendering it).
 */
export function resolvePreviewDisplay(input: {
  files: readonly PreviewLayoutFile[];
  showPreview?: boolean | null;
  showConsole?: boolean | null;
  previewBaseHtml?: string | null;
}): PreviewDisplay {
  const capability = previewCapability(input.files, {
    previewBaseHtml: input.previewBaseHtml,
  });
  const preview =
    input.showPreview == null
      ? capability.autoPreview
      : input.showPreview && capability.previewAllowed;
  const showConsole =
    input.showConsole == null
      ? capability.autoConsole
      : input.showConsole && capability.consoleAllowed;
  return {
    preview,
    console: showConsole,
    manualRun: showConsole && !preview,
  };
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

const MODULE_SYNTAX =
  /^[ \t]*(?:import\s*(?:[\w${}*,\s]+\s+from\s*)?["']|export\s+(?:default\b|const\b|let\b|var\b|function\b|class\b|async\b|\{|\*))/m;
const RELATIVE_IMPORT = /(\bfrom\s*|\bimport\s*)(["'])(\.{1,2}\/[^"'\n]+)\2/g;

// encodeURIComponent leaves ' alone, which would end a single-quoted import specifier early.
const dataModuleUrl = (source: string) =>
  `data:text/javascript;charset=utf-8,${encodeURIComponent(source).replace(/'/g, "%27")}`;

/** Last token before a "/" that makes it a regex literal rather than a division. */
const REGEX_CONTEXT =
  /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of|delete|void|throw|new))\s*$/;

/**
 * Blanks comments, regex literals and string contents (same length) so an import-looking text in
 * them is not mistaken for a real one. A string right after `from` / `import` is the specifier
 * and is kept. Template literals are blanked whole, so a `${}` body is not scanned.
 */
function maskNonCode(source: string): string {
  let out = "";
  let i = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && (c === "`" || source[j] !== "\n")) {
        j += source[j] === "\\" ? 2 : 1;
      }
      const literal = source.slice(i, j + 1);
      out += c !== "`" && /\b(?:from|import)\s*$/.test(out) ? literal : blank(literal);
      i = j + 1;
    } else if (c === "/" && next === "/") {
      const j = source.indexOf("\n", i);
      const end = j === -1 ? source.length : j;
      out += " ".repeat(end - i);
      i = end;
    } else if (c === "/" && next === "*") {
      const j = source.indexOf("*/", i + 2);
      const end = j === -1 ? source.length : j + 2;
      out += blank(source.slice(i, end));
      i = end;
    } else if (c === "/" && REGEX_CONTEXT.test(out)) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && source[j] !== "\n" && (inClass || source[j] !== "/")) {
        if (source[j] === "\\") j += 1;
        else if (source[j] === "[") inClass = true;
        else if (source[j] === "]") inClass = false;
        j += 1;
      }
      out += blank(source.slice(i, j + 1));
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out.slice(0, source.length);
}

interface RelativeImport {
  index: number;
  length: number;
  head: string;
  quote: string;
  spec: string;
}

function findRelativeImports(source: string): RelativeImport[] {
  return [...maskNonCode(source).matchAll(RELATIVE_IMPORT)].map((m) => ({
    index: m.index,
    length: m[0].length,
    head: m[1],
    quote: m[2],
    spec: m[3],
  }));
}

/**
 * JS-only submissions with import/export cannot run as classic scripts (SyntaxError), and the
 * opaque-origin srcDoc has no URL to resolve "./cart.js" against. Each dependency becomes a data:
 * module and the specifiers are rewritten to it in dependency order, because a data: referrer
 * cannot resolve relative specifiers (so an import map would only cover the entry file).
 * Cyclic imports are left as written and surface as a browser error; a missing file throws.
 */
function buildModuleScript(js: readonly CodeFile[]): string {
  const byName = new Map(js.map((f) => [f.filename.trim().replace(/^\.\//, ""), f]));
  const resolve = (spec: string): CodeFile | undefined => {
    const name = spec.replace(/^\.\//, "");
    return byName.get(name) ?? byName.get(`${name}.js`);
  };
  const urls = new Map<CodeFile, string>();
  const missing: string[] = [];
  const visiting = new Set<CodeFile>();
  const toSource = (file: CodeFile): string => {
    visiting.add(file);
    let source = file.content;
    for (const imp of findRelativeImports(file.content).reverse()) {
      const dep = resolve(imp.spec);
      if (!dep) {
        missing.push(imp.spec);
        continue;
      }
      if (visiting.has(dep)) continue;
      if (!urls.has(dep)) urls.set(dep, dataModuleUrl(toSource(dep)));
      const rewritten = `${imp.head}${imp.quote}${urls.get(dep)}${imp.quote}`;
      source = source.slice(0, imp.index) + rewritten + source.slice(imp.index + imp.length);
    }
    visiting.delete(file);
    return source;
  };
  const imported = new Set<CodeFile>();
  for (const file of js) {
    for (const imp of findRelativeImports(file.content)) {
      const dep = resolve(imp.spec);
      if (dep && dep !== file) imported.add(dep);
    }
  }
  const entry =
    js.find((f) => f.filename.trim().toLowerCase() === "main.js") ??
    [...js].reverse().find((f) => !imported.has(f)) ??
    js[js.length - 1];
  const entrySource = toSource(entry);
  if (missing.length > 0) {
    // A missing file would be fetched from the app origin and fail silently (the error fires on
    // the <script> element, not window), and a stub module fails at link time for named imports.
    const message = `Cannot find module '${missing[0]}'`;
    return `<script>throw new Error(${JSON.stringify(message)});</script>`;
  }
  return `<script type="module">${escapeClosingTag(entrySource, "script")}</script>`;
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
  {
    headPrelude = "",
    previewBaseHtml = null,
    vendorBaseUrl = "",
  }: { headPrelude?: string; previewBaseHtml?: string | null; vendorBaseUrl?: string } = {}
): string {
  if (classifyPreviewLayout(files) === "react") {
    return buildReactPreviewDocument(files, { headPrelude, vendorBaseUrl });
  }

  const submittedHtml =
    files.find((f) => f.filename.trim().toLowerCase() === "index.html") ??
    files.find((f) => resolveFileLanguage(f) === "html");

  // Scaffold is only for CSS-only layouts (#351 review). JS / JS+CSS must keep the empty-page
  // script path; otherwise previewBaseHtml would drop <script> and the console stays empty.
  const scaffold =
    previewBaseHtml?.trim() && !submittedHtml && classifyPreviewLayout(files) === "css"
      ? {
          filename: "index.html",
          language: "html",
          content: previewBaseHtml,
        }
      : null;
  const base = submittedHtml ?? scaffold;

  if (!base) {
    const css = files.filter((f) => resolveFileLanguage(f) === "css");
    const js = files.filter((f) => resolveFileLanguage(f) === "javascript");
    const styles = css.map((f) => `<style>${escapeClosingTag(f.content, "style")}</style>`);
    const scripts = js.some((f) => MODULE_SYNTAX.test(maskNonCode(f.content)))
      ? [buildModuleScript(js)]
      : js.map((f) => `<script>${escapeClosingTag(f.content, "script")}</script>`);
    return `<!doctype html><html><head><meta charset="utf-8">${headPrelude}${styles.join("")}</head><body>${scripts.join("")}</body></html>`;
  }

  // Scaffold path (#351): inject every CSS file as <style> so the markup has something to style
  // even when the scaffold has no <link>. Submitted HTML keeps the existing link-expansion path.
  const scaffoldStyles =
    !submittedHtml && scaffold
      ? files
          .filter((f) => resolveFileLanguage(f) === "css")
          .map((f) => `<style>${escapeClosingTag(f.content, "style")}</style>`)
          .join("")
      : "";
  const headInsert = headPrelude + scaffoldStyles;

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
  let preludePlaced = headInsert === "";
  let preludeSearchOpen = true;
  const transform = (match: string, groups: ScanGroups, closed: boolean): string => {
    if (groups.element !== undefined) {
      const isHead = groups.element.toLowerCase() === "head" && match.endsWith(">");
      if (preludeSearchOpen && !preludePlaced && isHead) {
        preludePlaced = true;
        return match + headInsert;
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
    // Scaffold already injects all CSS; expanding links would duplicate styles.
    if (scaffoldStyles) {
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
      : expanded.slice(0, preludeAt) + headInsert + expanded.slice(preludeAt);
  if (deferred.length === 0) {
    return withPrelude;
  }
  // An unclosed <template> runs to the end, so anything appended would be inert.
  const endAt = templateDepth > 0 ? templateAt : unclosedTail;
  let deferAt = endAt !== -1 ? endAt : expanded.length;
  if (preludeAt !== -1 && deferAt >= preludeAt) {
    deferAt += headInsert.length;
  }
  return withPrelude.slice(0, deferAt) + deferred.join("") + withPrelude.slice(deferAt);
}

function vendorScriptUrl(vendorBaseUrl: string, file: string): string {
  const base = vendorBaseUrl.replace(/\/$/, "");
  return `${base}${PREVIEW_REACT_VENDOR_DIR}/${file}`;
}

/**
 * Builds a srcDoc document that loads pinned React / ReactDOM / Babel from this origin, transforms
 * each .jsx/.js file, resolves relative imports with a tiny require, and mounts App into #root.
 * headPrelude (console bridge) is placed before the vendor scripts so it can catch transform errors.
 */
function buildReactPreviewDocument(
  files: readonly CodeFile[],
  { headPrelude = "", vendorBaseUrl = "" }: { headPrelude?: string; vendorBaseUrl?: string }
): string {
  const cssFiles = files.filter((f) => fileExtension(f.filename) === "css");
  // The Tailwind browser build compiles only <style type="text/tailwindcss">; plain <style> would
  // leave `@import "tailwindcss"` unresolved. Other CSS files stay plain so React exercises are unchanged.
  const useTailwind = cssFiles.some((f) => TAILWIND_IMPORT.test(f.content));
  const styles = cssFiles
    .map((f) => {
      const type = useTailwind && TAILWIND_IMPORT.test(f.content) ? ' type="text/tailwindcss"' : "";
      return `<style${type}>${escapeClosingTag(f.content, "style")}</style>`;
    })
    .join("");
  const scriptFiles = files.filter((f) => {
    const ext = fileExtension(f.filename);
    return ext === "js" || ext === "jsx";
  });

  // JSON inside a <script>: escape </script and <!-- so learner source cannot break out of the tag.
  const sourcesJson = escapeClosingTag(
    JSON.stringify(Object.fromEntries(scriptFiles.map((f) => [f.filename.trim(), f.content]))),
    "script"
  );
  // CSS is already in <style>; register empty modules so `import "./App.css"` (Vite/CRA style) resolves.
  const cssModuleNamesJson = escapeClosingTag(
    JSON.stringify(cssFiles.map((f) => f.filename.trim())),
    "script"
  );

  const reactUrl = vendorScriptUrl(vendorBaseUrl, REACT_VENDOR_FILES.react);
  const reactDomUrl = vendorScriptUrl(vendorBaseUrl, REACT_VENDOR_FILES.reactDom);
  const babelUrl = vendorScriptUrl(vendorBaseUrl, REACT_VENDOR_FILES.babel);
  const tailwindScript = useTailwind
    ? `<script src="${vendorScriptUrl(vendorBaseUrl, REACT_VENDOR_FILES.tailwind)}"></script>`
    : "";

  // Runs after Babel loads. Kept as an ES5 string so the preview does not depend on the app bundle.
  const bootstrap = escapeClosingTag(
    `(function(){
var sources=${sourcesJson};
var cssNames=${cssModuleNamesJson};
var modules={};
var cache={};
function normalize(id){
  if(id==="react")return "react";
  var name=String(id).replace(/^\\.\\//,"");
  if(modules[name])return name;
  if(modules[name+".js"])return name+".js";
  if(modules[name+".jsx"])return name+".jsx";
  if(modules[name+".css"])return name+".css";
  return name;
}
function req(id){
  if(id==="react")return window.React;
  var name=normalize(id);
  if(cache[name])return cache[name].exports;
  var factory=modules[name];
  if(!factory){
    throw new Error("Cannot find module '"+id+"'");
  }
  var module={exports:{}};
  cache[name]=module;
  factory(module,module.exports,req);
  return module.exports;
}
for(var c=0;c<cssNames.length;c++){
  modules[cssNames[c]]=function(module){module.exports={};};
}
var names=Object.keys(sources);
for(var i=0;i<names.length;i++){
  (function(filename){
    var src=sources[filename];
    try{
      if(typeof Babel==="undefined"||!Babel.transform){
        throw new Error("Babel failed to load");
      }
      var result=Babel.transform(src,{
        presets:[["react",{runtime:"classic"}]],
        plugins:["transform-modules-commonjs"],
        filename:filename
      });
      modules[filename]=new Function("module","exports","require",result.code);
    }catch(err){
      console.error("[preview] "+filename+": "+(err&&err.message?err.message:String(err)));
    }
  })(names[i]);
}
try{
  if(typeof React==="undefined"||typeof ReactDOM==="undefined"||!ReactDOM.createRoot){
    throw new Error("React failed to load");
  }
  var entries=["App.jsx","App.js","page.jsx","page.js"];
  var appName=null;
  for(var e=0;e<entries.length&&!appName;e++){if(modules[entries[e]])appName=entries[e];}
  if(!appName){
    throw new Error("App.jsx (or App.js / page.js) did not compile");
  }
  var exp=req("./"+appName);
  var App=exp&&(exp.default||exp);
  if(!App){
    throw new Error("App has no default export");
  }
  // The vendor scripts are cross-origin for this opaque-origin frame, so errors thrown inside React
  // reach window.onerror as an opaque "Script error."; reporting them here keeps the message.
  var report=function(err){
    console.error("[preview] "+(err&&err.message?err.message:String(err)));
  };
  ReactDOM.createRoot(document.getElementById("root"),{
    onUncaughtError:report,
    onCaughtError:report
  }).render(React.createElement(App));
}catch(err){
  console.error("[preview] "+(err&&err.message?err.message:String(err)));
}
})();`,
    "script"
  );

  return `<!doctype html><html><head><meta charset="utf-8">${headPrelude}<script src="${reactUrl}"></script><script src="${reactDomUrl}"></script><script src="${babelUrl}"></script>${tailwindScript}${styles}</head><body><div id="root"></div><script>${bootstrap}</script></body></html>`;
}
