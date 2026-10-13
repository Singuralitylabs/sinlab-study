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
  return content.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
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
 */
export function buildPreviewDocument(files: readonly CodeFile[]): string {
  const base =
    files.find((f) => f.filename.trim().toLowerCase() === "index.html") ??
    files.find((f) => resolveFileLanguage(f) === "html");

  if (!base) {
    const css = files.filter((f) => resolveFileLanguage(f) === "css");
    const js = files.filter((f) => resolveFileLanguage(f) === "javascript");
    const styles = css.map((f) => `<style>${escapeClosingTag(f.content, "style")}</style>`);
    const scripts = js.map((f) => `<script>${escapeClosingTag(f.content, "script")}</script>`);
    return `<!doctype html><html><head><meta charset="utf-8">${styles.join("")}</head><body>${scripts.join("")}</body></html>`;
  }

  const withStyles = base.content.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = getAttribute(tag, "rel");
    const href = getAttribute(tag, "href");
    if (rel?.toLowerCase() !== "stylesheet" || href === null || !isRelativeRef(href)) {
      return tag;
    }
    const file = findFile(files, href);
    return file ? `<style>${escapeClosingTag(file.content, "style")}</style>` : tag;
  });

  return withStyles.replace(/<script\b([^>]*)>\s*<\/script\s*>/gi, (element, attrs: string) => {
    const src = getAttribute(`<script${attrs}>`, "src");
    if (src === null || !isRelativeRef(src)) {
      return element;
    }
    const file = findFile(files, src);
    return file ? `<script>${escapeClosingTag(file.content, "script")}</script>` : element;
  });
}
