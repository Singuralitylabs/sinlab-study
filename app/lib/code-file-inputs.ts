import {
  buildDefaultFilename,
  CODE_LANGUAGES,
  type CodeLanguage,
} from "@/app/components/code-editor-utils";
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

function resolveLanguage(language: string, fallback: CodeLanguage): CodeLanguage {
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
 */
export function buildInitialCodeFiles(
  starterFiles: CodeFile[] | null | undefined,
  codeLanguage: CodeLanguage
): CodeFileInput[] {
  if (starterFiles && starterFiles.length > 0) {
    return starterFiles.map((file, index) => ({
      id: `starter-${index}`,
      filename: file.filename,
      language: resolveLanguage(file.language, codeLanguage),
      content: file.content,
      filenameEdited: file.filename.trim().length > 0,
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
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const files = raw
    .filter((f): f is { [key: string]: Json | undefined } => typeof f === "object" && f !== null)
    .map((f) => ({
      filename: typeof f.filename === "string" ? f.filename : "",
      language: typeof f.language === "string" ? f.language : "",
      content: typeof f.content === "string" ? f.content : "",
    }))
    .filter((f) => f.filename.trim().length > 0 || f.content.length > 0);

  return files.length > 0 ? files : null;
}

/** Admin save payload: null clears starter_files; empty / blank rows are dropped. */
export function toStarterFilesPayload(files: readonly CodeFileInput[]): CodeFile[] | null {
  const payload = files
    .map((file) => ({
      filename: file.filename.trim(),
      language: file.language,
      content: file.content,
    }))
    .filter((file) => file.filename.length > 0);

  return payload.length > 0 ? payload : null;
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
