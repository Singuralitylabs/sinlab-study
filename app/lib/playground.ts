import {
  PLAYGROUND_DEFAULT_FILES,
  PLAYGROUND_EXTENSION_LANGUAGES,
  PLAYGROUND_KINDS,
  PLAYGROUND_MAX_FILE_LENGTH,
  PLAYGROUND_MAX_FILENAME_LENGTH,
  PLAYGROUND_MAX_FILES,
  PLAYGROUND_MAX_TOTAL_LENGTH,
  PLAYGROUND_STORAGE_PREFIX,
  PLAYGROUND_TEMPLATE_SLUG_LENGTH,
  type PlaygroundKind,
  type PlaygroundLanguage,
} from "@/app/constants/playground";
import type { CodeFile } from "@/app/types";

export interface PlaygroundFileInput {
  filename: string;
  content: string;
}

export function isPlaygroundKind(value: unknown): value is PlaygroundKind {
  return (PLAYGROUND_KINDS as readonly unknown[]).includes(value);
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** null when the extension does not belong to the kind. */
export function playgroundLanguageFor(
  kind: PlaygroundKind,
  filename: string
): PlaygroundLanguage | null {
  return PLAYGROUND_EXTENSION_LANGUAGES[kind][extensionOf(filename.trim())] ?? null;
}

export function playgroundExtensionsLabel(kind: PlaygroundKind): string {
  return Object.keys(PLAYGROUND_EXTENSION_LANGUAGES[kind])
    .map((ext) => `.${ext}`)
    .join(" / ");
}

/**
 * The preview inlines files by bare name and Python writes them side by side in one directory, so
 * a name with a folder, a leading dot or control characters would not resolve (or would collide
 * with files Pyodide itself loads).
 */
const PLAIN_FILENAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

export function playgroundFilenameError(
  kind: PlaygroundKind,
  filename: string,
  otherFilenames: readonly string[]
): string | null {
  const name = filename.trim();
  if (!name) {
    return "ファイル名を入力してください";
  }
  if (name.length > PLAYGROUND_MAX_FILENAME_LENGTH) {
    return `ファイル名は${PLAYGROUND_MAX_FILENAME_LENGTH}文字以内にしてください`;
  }
  if (!PLAIN_FILENAME.test(name)) {
    return "ファイル名は半角英数字と - _ . だけで付けてください（フォルダは使えません）";
  }
  if (!playgroundLanguageFor(kind, name)) {
    return `この種類で使える拡張子は ${playgroundExtensionsLabel(kind)} です`;
  }
  if (otherFilenames.some((other) => other.trim().toLowerCase() === name.toLowerCase())) {
    return `「${name}」はすでにあります`;
  }
  return null;
}

/** First problem with the whole set, or null. Used by the page, the template API and drafts. */
export function playgroundFilesError(
  kind: PlaygroundKind,
  files: readonly PlaygroundFileInput[]
): string | null {
  if (files.length === 0) {
    return "ファイルが1つもありません";
  }
  if (files.length > PLAYGROUND_MAX_FILES) {
    return `ファイルは${PLAYGROUND_MAX_FILES}個までです`;
  }
  for (const [index, file] of files.entries()) {
    const others = files.filter((_, i) => i !== index).map((f) => f.filename);
    const nameError = playgroundFilenameError(kind, file.filename, others);
    if (nameError) {
      return nameError;
    }
    if (file.content.length > PLAYGROUND_MAX_FILE_LENGTH) {
      return `「${file.filename.trim()}」が長すぎます（1ファイル${PLAYGROUND_MAX_FILE_LENGTH.toLocaleString()}文字まで）`;
    }
  }
  const total = files.reduce((sum, file) => sum + file.content.length, 0);
  if (total > PLAYGROUND_MAX_TOTAL_LENGTH) {
    return `コードが長すぎます（合計${PLAYGROUND_MAX_TOTAL_LENGTH.toLocaleString()}文字まで）`;
  }
  return null;
}

/** Runner input: language comes from the extension, never from stored or client data. */
export function toPlaygroundCodeFiles(
  kind: PlaygroundKind,
  files: readonly PlaygroundFileInput[]
): CodeFile[] {
  return files.map((file) => ({
    filename: file.filename.trim(),
    language: playgroundLanguageFor(kind, file.filename) ?? "",
    content: file.content,
  }));
}

export function defaultPlaygroundFiles(kind: PlaygroundKind): PlaygroundFileInput[] {
  return PLAYGROUND_DEFAULT_FILES[kind].map((file) => ({ ...file }));
}

/**
 * The user id is part of the key: a shared machine at a workshop must not show the previous
 * person's code to the next one who signs in.
 */
export function playgroundStorageKey(
  userId: number,
  draft: { kind: PlaygroundKind } | { templateSlug: string }
): string {
  const scope = "kind" in draft ? `kind:${draft.kind}` : `template:${draft.templateSlug}`;
  return `${PLAYGROUND_STORAGE_PREFIX}:u${userId}:${scope}`;
}

/** localStorage is user-editable: anything that is not a valid file set is treated as absent. */
export function parsePlaygroundDraft(
  kind: PlaygroundKind,
  raw: string | null
): PlaygroundFileInput[] | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const files: PlaygroundFileInput[] = [];
  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as { filename?: unknown }).filename !== "string" ||
      typeof (item as { content?: unknown }).content !== "string"
    ) {
      return null;
    }
    const { filename, content } = item as PlaygroundFileInput;
    files.push({ filename, content });
  }
  return playgroundFilesError(kind, files) === null ? files : null;
}

export function serializePlaygroundDraft(files: readonly PlaygroundFileInput[]): string {
  return JSON.stringify(files.map(({ filename, content }) => ({ filename, content })));
}

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Rejection sampling keeps every character equally likely (256 is not a multiple of 36). */
export function generatePlaygroundTemplateSlug(
  randomBytes: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length))
): string {
  const limit = 256 - (256 % SLUG_ALPHABET.length);
  let slug = "";
  while (slug.length < PLAYGROUND_TEMPLATE_SLUG_LENGTH) {
    for (const byte of randomBytes(PLAYGROUND_TEMPLATE_SLUG_LENGTH)) {
      if (byte < limit && slug.length < PLAYGROUND_TEMPLATE_SLUG_LENGTH) {
        slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
      }
    }
  }
  return slug;
}

/** HTML files the Web preview can show, in tab order. */
export function playgroundHtmlPages(files: readonly CodeFile[]): string[] {
  return files.filter((file) => file.language === "html").map((file) => file.filename);
}

/**
 * The preview renders index.html (else the first HTML file) and ignores the rest. To show another
 * page, the other HTML files are left out so the chosen one becomes the document; CSS / JS stay so
 * its link / script tags still resolve. A missing choice (renamed or deleted) falls back silently.
 */
export function selectPlaygroundPreviewPage(
  files: readonly CodeFile[],
  page: string | null
): CodeFile[] {
  if (!page || !playgroundHtmlPages(files).includes(page)) {
    return [...files];
  }
  return files.filter((file) => file.language !== "html" || file.filename === page);
}

/** The page the preview shows when nothing is chosen (same rule as buildPreviewDocument). */
export function defaultPlaygroundPreviewPage(files: readonly CodeFile[]): string | null {
  const pages = playgroundHtmlPages(files);
  return pages.find((name) => name.toLowerCase() === "index.html") ?? pages[0] ?? null;
}
