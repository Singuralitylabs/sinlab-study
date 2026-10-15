import {
  buildDefaultFilename,
  CODE_LANGUAGES,
  type CodeLanguage,
  DEFAULT_FILENAME_BY_LANGUAGE,
} from "@/app/components/code-editor-utils";
import { normalizeCodeFileRows } from "@/app/lib/submission-files";
import type { CodeFile, Json } from "@/app/types";

export type CodeFileInput = {
  id: string;
  filename: string;
  language: CodeLanguage;
  content: string;
  // Whether the user edited the filename by hand; while false, the default follows language
  // changes.
  filenameEdited: boolean;
};

export type StarterFilesPayloadResult =
  | { ok: true; files: CodeFile[] | null }
  | { ok: false; error: string };

export function resolveLanguage(language: string, fallback: CodeLanguage): CodeLanguage {
  return CODE_LANGUAGES.includes(language as CodeLanguage) ? (language as CodeLanguage) : fallback;
}

export function createEmptyCodeFile(
  language: CodeLanguage,
  existingFilenames: string[] = [],
  options?: { withDefaultFilename?: boolean }
): CodeFileInput {
  const withDefaultFilename = options?.withDefaultFilename ?? false;
  return {
    id: crypto.randomUUID(),
    filename: withDefaultFilename ? buildDefaultFilename(language, existingFilenames) : "",
    language,
    content: "",
    filenameEdited: false,
  };
}

/**
 * Learner form initial files: starter when present, otherwise one empty file (existing behavior).
 * Starter filenames are treated as edited so language changes do not overwrite them.
 * Pass `filenameEdited: true` for the admin starter editor (names are always intentional).
 */
export function buildInitialCodeFiles(
  starterFiles: CodeFile[] | null | undefined,
  codeLanguage: CodeLanguage,
  options?: { filenameEdited?: boolean }
): CodeFileInput[] {
  if (starterFiles && starterFiles.length > 0) {
    return starterFiles.map((file, index) => ({
      id: `starter-${index}`,
      filename: file.filename,
      language: resolveLanguage(file.language, codeLanguage),
      content: file.content,
      filenameEdited: options?.filenameEdited ?? file.filename.trim().length > 0,
    }));
  }
  return [
    {
      id: "file-0",
      filename: "",
      language: codeLanguage,
      content: "",
      filenameEdited: false,
    },
  ];
}

/** Normalize learning_contents.starter_files JSON into CodeFile[] (null when absent/empty). */
export function parseStarterFiles(raw: Json | null | undefined): CodeFile[] | null {
  const files = normalizeCodeFileRows(raw).filter(
    (f) => f.filename.trim().length > 0 || f.content.length > 0
  );
  return files.length > 0 ? files : null;
}

/**
 * Admin save payload. null clears starter_files. Rows with content (or the sole row) but an empty
 * filename are rejected — silently dropping them would erase starter content on save.
 */
export function toStarterFilesPayload(files: readonly CodeFileInput[]): StarterFilesPayloadResult {
  if (files.length === 0) {
    return { ok: true, files: null };
  }

  for (const file of files) {
    const filename = file.filename.trim();
    if (filename.length === 0 && (file.content.length > 0 || files.length === 1)) {
      return {
        ok: false,
        error: "初期コードのファイル名を入力してください",
      };
    }
  }

  const payload = files
    .map((file) => ({
      filename: file.filename.trim(),
      language: file.language,
      content: file.content,
    }))
    .filter((file) => file.filename.length > 0);

  return { ok: true, files: payload.length > 0 ? payload : null };
}

/**
 * Payload for POST /api/submissions.
 * Empty-content rows (optional starter shells left blank) are omitted so they do not block submit.
 * A single file matching content code_language with no custom filename clears language/filename so
 * the API keeps the legacy code_content path; otherwise metadata is kept and stored as code_files.
 */
export function buildSubmissionCodeFiles(
  files: readonly CodeFileInput[],
  contentCodeLanguage: CodeLanguage
): CodeFile[] {
  const withContent = files
    .filter((file) => file.content.trim().length > 0)
    .map((file) => ({
      filename: file.filename.trim(),
      language: file.language,
      content: file.content,
    }));

  if (withContent.length !== 1) {
    return withContent;
  }

  const file = withContent[0];
  const defaultFilename = DEFAULT_FILENAME_BY_LANGUAGE[contentCodeLanguage];
  const languageMatches = file.language === contentCodeLanguage;
  const filenameIsDefault = file.filename.length === 0 || file.filename === defaultFilename;
  if (languageMatches && filenameIsDefault) {
    return [{ filename: "", language: "", content: file.content }];
  }
  return withContent;
}

/** True when at least one file has content; empty shells are optional and ignored. */
export function isSubmissionCodeValid(files: readonly CodeFileInput[]): boolean {
  const withContent = files.filter((file) => file.content.trim().length > 0);
  if (withContent.length === 0) {
    return false;
  }
  // Filename is required only when the multi-file UI is showing (more than one row).
  if (files.length > 1) {
    return withContent.every((file) => file.filename.trim().length > 0);
  }
  return true;
}

/**
 * Trimmed non-empty contents as a sorted multiset. Filename/language/order are ignored so rename,
 * language-only edits, empty shells, and API order swaps still count as unchanged.
 */
function toComparableContents(files: readonly { content: string }[]): string[] {
  return files
    .map((file) => file.content.trim())
    .filter((content) => content.length > 0)
    .sort();
}

type CodeContentRow = { filename: string; language: string; content: string };

/**
 * True when submitted code matches starter by trimmed content multiset only. Used client- and
 * server-side to block burning an AI review slot.
 */
export function isCodeEquivalentToStarter(
  submitted: readonly CodeContentRow[],
  starter: readonly CodeContentRow[] | null | undefined
): boolean {
  if (!starter || starter.length === 0) {
    return false;
  }
  const left = toComparableContents(submitted);
  const right = toComparableContents(starter);
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return false;
  }
  return left.every((content, index) => content === right[index]);
}

export function updateCodeFileAt(
  files: readonly CodeFileInput[],
  index: number,
  patch: Partial<CodeFileInput>
): CodeFileInput[] {
  return files.map((file, i) => (i === index ? { ...file, ...patch } : file));
}

export function changeCodeFileLanguage(
  files: readonly CodeFileInput[],
  index: number,
  language: CodeLanguage
): CodeFileInput[] {
  return files.map((file, i) => {
    if (i !== index) {
      return file;
    }
    if (file.filenameEdited) {
      return { ...file, language };
    }
    const otherFilenames = files.filter((_, j) => j !== index).map((f) => f.filename);
    return { ...file, language, filename: buildDefaultFilename(language, otherFilenames) };
  });
}

/**
 * Append a file. On the first single -> multi switch, fill default names for empty filenames (the
 * filename field is hidden and blank in single-file mode).
 */
export function addCodeFile(
  files: readonly CodeFileInput[],
  defaultLanguage: CodeLanguage,
  options?: { withDefaultFilename?: boolean }
): CodeFileInput[] {
  const withDefaultFilename = options?.withDefaultFilename ?? true;
  const assigned: string[] = files.map((f) => f.filename).filter((name) => name.trim().length > 0);
  const backfilled = files.map((file) => {
    if (file.filename.trim().length > 0) {
      return file;
    }
    const filename = buildDefaultFilename(file.language, assigned);
    assigned.push(filename);
    return { ...file, filename };
  });
  return [...backfilled, createEmptyCodeFile(defaultLanguage, assigned, { withDefaultFilename })];
}
