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
  // The same pass places headPrelude, so a "<head>" inside a comment, a style or a script string is
  // never taken for the element (the prelude's </script> would end the learner's script early).
  const deferred: string[] = [];
  let preludePlaced = headPrelude === "";
  let preludeSearchOpen = true;
  const expanded = base.content.replace(
    /<!--[\s\S]*?-->|<style\b[^>]*>[\s\S]*?<\/style\s*>|<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<link\b[^>]*>|<(head|body)\b[^>]*>/gi,
    (match: string, scriptAttrs?: string, scriptBody?: string, element?: string) => {
      if (match.startsWith("<!--") || /^<style/i.test(match)) {
        return match;
      }

      if (element !== undefined) {
        if (preludeSearchOpen && !preludePlaced && element.toLowerCase() === "head") {
          preludePlaced = true;
          return match + headPrelude;
        }
        preludeSearchOpen = false;
        return match;
      }

      if (scriptAttrs !== undefined) {
        preludeSearchOpen = false;
        const tag = `<script${scriptAttrs}>`;
        const src = getAttribute(tag, "src");
        if (src === null || scriptBody?.trim() !== "" || !isRelativeRef(src)) {
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
      if (rel?.toLowerCase() !== "stylesheet" || href === null || !isRelativeRef(href)) {
        return match;
      }
      const file = findFile(files, href);
      return file ? `<style>${escapeClosingTag(file.content, "style")}</style>` : match;
    }
  );

  const withPrelude = preludePlaced ? expanded : insertAfterDoctype(expanded, headPrelude);
  if (deferred.length === 0) {
    return withPrelude;
  }
  const tail = deferred.join("");
  const bodyEnd = withPrelude.search(/<\/body\s*>/i);
  return bodyEnd === -1
    ? withPrelude + tail
    : withPrelude.slice(0, bodyEnd) + tail + withPrelude.slice(bodyEnd);
}

function insertAfterDoctype(html: string, content: string): string {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  const at = doctype ? doctype[0].length : 0;
  return html.slice(0, at) + content + html.slice(at);
}
