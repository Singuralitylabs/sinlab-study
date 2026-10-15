import {
  CODE_LANGUAGES,
  type CodeLanguage,
  DEFAULT_FILENAME_BY_LANGUAGE,
} from "@/app/components/code-editor-utils";
import type { CodeFileInput } from "@/app/lib/code-file-inputs";
import type { CodeFile } from "@/app/types";

/** Upper bound for exercise submission files. Enforced by zod and the admin editor. */
export const SUBMISSION_FILE_SLOT_MAX_COUNT = 10;

export const EMPTY_SUBMISSION_FILE_ERROR = "空のファイルは提出できません";
export const SUBMISSION_FILE_SLOTS_MISMATCH_ERROR = "提出ファイルの構成が演習の指定と一致しません";

export type SubmissionFileSlot = {
  filename: string;
  language: CodeLanguage;
};

export type SubmissionSlotDraftInput = {
  filename: string;
  language: CodeLanguage;
  starterContent: string;
};

export type SubmissionSlotPayloadResult =
  | {
      ok: true;
      slots: SubmissionFileSlot[] | null;
      starterFiles: CodeFile[] | null;
      codeLanguage: CodeLanguage;
    }
  | { ok: false; error: string };

const DEFAULT_CODE_LANGUAGE: CodeLanguage = "javascript";

export function normalizeCodeLanguage(language: string | null | undefined): CodeLanguage {
  return CODE_LANGUAGES.includes(language as CodeLanguage)
    ? (language as CodeLanguage)
    : DEFAULT_CODE_LANGUAGE;
}

export function defaultSubmissionFileSlot(codeLanguage: CodeLanguage): SubmissionFileSlot {
  return {
    filename: DEFAULT_FILENAME_BY_LANGUAGE[codeLanguage],
    language: codeLanguage,
  };
}

/** null when the JSON is not a usable slot list (caller then falls back). */
export function parseSubmissionFileSlots(raw: unknown): SubmissionFileSlot[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SUBMISSION_FILE_SLOT_MAX_COUNT) {
    return null;
  }
  const slots: SubmissionFileSlot[] = [];
  const names = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      return null;
    }
    const record = row as { filename?: unknown; language?: unknown };
    const filename = typeof record.filename === "string" ? record.filename.trim() : "";
    const language = typeof record.language === "string" ? record.language : "";
    if (
      filename.length === 0 ||
      names.has(filename) ||
      !CODE_LANGUAGES.includes(language as CodeLanguage)
    ) {
      return null;
    }
    names.add(filename);
    slots.push({ filename, language: language as CodeLanguage });
  }
  return slots;
}

/**
 * NULL slots mean one file of code_language. starter_files already names files (#341), so those
 * names win over the single-file default; otherwise a multi-file starter would collapse to one
 * blank file when the form locks the layout.
 */
export function resolveSubmissionFileSlots(input: {
  submissionFileSlots: unknown;
  starterFiles?: readonly { filename: string; language: string; content?: string }[] | null;
  codeLanguage?: string | null;
}): SubmissionFileSlot[] {
  const parsed = parseSubmissionFileSlots(input.submissionFileSlots);
  if (parsed) {
    return parsed;
  }
  const starter = (input.starterFiles ?? []).filter((file) => file.filename.trim().length > 0);
  const fromStarter = parseSubmissionFileSlots(
    starter.map((file) => ({ filename: file.filename, language: file.language }))
  );
  if (fromStarter) {
    return fromStarter;
  }
  return [defaultSubmissionFileSlot(normalizeCodeLanguage(input.codeLanguage))];
}

export function isDefaultSingleFileSlot(
  slots: readonly SubmissionFileSlot[],
  codeLanguage: CodeLanguage
): boolean {
  return (
    slots.length === 1 &&
    slots[0].language === codeLanguage &&
    slots[0].filename === DEFAULT_FILENAME_BY_LANGUAGE[codeLanguage]
  );
}

function readSubmittedFile(
  value: unknown
): { filename: string; language: string; content: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { filename?: unknown; language?: unknown; content?: unknown };
  if (typeof record.content !== "string") {
    return null;
  }
  return {
    filename: typeof record.filename === "string" ? record.filename.trim() : "",
    language: typeof record.language === "string" ? record.language : "",
    content: record.content,
  };
}

/**
 * Count, filename, language, and order must match the resolved slots. Blank filename and language
 * are accepted only for the default single-file exercise: older clients omit them so the row can
 * stay in code_content.
 */
export function filesMatchSubmissionFileSlots(
  rawFiles: unknown,
  slots: readonly SubmissionFileSlot[],
  codeLanguage: CodeLanguage
): { ok: true; files: CodeFile[] } | { ok: false; error: string } {
  if (!Array.isArray(rawFiles) || rawFiles.length !== slots.length) {
    return { ok: false, error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR };
  }
  const allowLegacy = isDefaultSingleFileSlot(slots, codeLanguage);
  const files: CodeFile[] = [];
  for (let index = 0; index < slots.length; index++) {
    const file = readSubmittedFile(rawFiles[index]);
    const slot = slots[index];
    if (!file) {
      return { ok: false, error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR };
    }
    const legacy = allowLegacy && file.filename.length === 0 && file.language.length === 0;
    if (!legacy && (file.filename !== slot.filename || file.language !== slot.language)) {
      return { ok: false, error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR };
    }
    if (file.content.trim().length === 0) {
      return { ok: false, error: EMPTY_SUBMISSION_FILE_ERROR };
    }
    files.push({
      filename: legacy ? "" : file.filename,
      language: legacy ? "" : file.language,
      content: file.content,
    });
  }
  return { ok: true, files };
}

/**
 * code_content cannot store a name. Only the exercise's default single file keeps that path;
 * any other single file stays in code_files so the name survives for later display.
 */
export function toStoredSubmissionCode(
  files: readonly CodeFile[],
  codeLanguage: CodeLanguage
): { codeContent: string | null; codeFiles: CodeFile[] | null } {
  if (files.length === 1) {
    const file = files[0];
    const blank = file.filename.trim().length === 0 && file.language.trim().length === 0;
    const isDefault =
      file.language === codeLanguage &&
      file.filename === DEFAULT_FILENAME_BY_LANGUAGE[codeLanguage];
    if (blank || isDefault) {
      return { codeContent: file.content, codeFiles: null };
    }
  }
  return { codeContent: null, codeFiles: [...files] };
}

function starterContentForSlot(
  slot: SubmissionFileSlot,
  index: number,
  slots: readonly SubmissionFileSlot[],
  starters: readonly { filename: string; language: string; content?: string }[]
): string {
  const byIndex = starters[index];
  if (
    byIndex !== undefined &&
    byIndex.filename.trim() === slot.filename &&
    byIndex.language === slot.language
  ) {
    return byIndex.content ?? "";
  }
  const named = starters.find(
    (file) => file.filename.trim() === slot.filename && file.language === slot.language
  );
  if (named) {
    return named.content ?? "";
  }
  // #341 kept a single starter row with an empty filename. The default slot uses
  // DEFAULT_FILENAME_BY_LANGUAGE, so a name match would drop that content and an admin save
  // would then store starter_files as null.
  const only = starters.length === 1 ? starters[0] : undefined;
  if (
    slots.length === 1 &&
    index === 0 &&
    only !== undefined &&
    only.filename.trim().length === 0 &&
    (only.language.length === 0 || only.language === slot.language)
  ) {
    return only.content ?? "";
  }
  return "";
}

/** Learner/demo initial rows: one locked editor per resolved slot, starter text filled in. */
export function buildLockedSubmissionFiles(input: {
  submissionFileSlots: unknown;
  starterFiles?: readonly CodeFile[] | null;
  codeLanguage?: string | null;
}): CodeFileInput[] {
  const slots = resolveSubmissionFileSlots(input);
  const starters = input.starterFiles ?? [];
  return slots.map((slot, index) => ({
    id: `slot-${index}`,
    filename: slot.filename,
    language: slot.language,
    content: starterContentForSlot(slot, index, slots, starters),
    // Locked rows must not have their names rewritten if a language helper runs.
    filenameEdited: true,
  }));
}

/** Admin save. null slots means the single default file of the first row's language. */
export function toSubmissionSlotPayload(
  drafts: readonly SubmissionSlotDraftInput[]
): SubmissionSlotPayloadResult {
  if (drafts.length === 0) {
    return { ok: false, error: "提出ファイルを1つ以上指定してください" };
  }
  if (drafts.length > SUBMISSION_FILE_SLOT_MAX_COUNT) {
    return {
      ok: false,
      error: `提出ファイルは${SUBMISSION_FILE_SLOT_MAX_COUNT}個までです`,
    };
  }
  const normalized = drafts.map((draft) => ({
    filename: draft.filename.trim(),
    language: draft.language,
    content: draft.starterContent,
  }));
  if (normalized.some((file) => file.filename.length === 0)) {
    return { ok: false, error: "提出ファイルのファイル名を入力してください" };
  }
  if (new Set(normalized.map((file) => file.filename)).size !== normalized.length) {
    return { ok: false, error: "提出ファイルのファイル名が重複しています" };
  }
  if (normalized.some((file) => !CODE_LANGUAGES.includes(file.language))) {
    return { ok: false, error: "提出ファイルの言語が不正です" };
  }
  const codeLanguage = normalized[0].language;
  const isDefaultSingle =
    normalized.length === 1 &&
    normalized[0].filename === DEFAULT_FILENAME_BY_LANGUAGE[codeLanguage];
  const hasStarter = normalized.some((file) => file.content.length > 0);
  return {
    ok: true,
    codeLanguage,
    slots: isDefaultSingle
      ? null
      : normalized.map(({ filename, language }) => ({ filename, language })),
    starterFiles: hasStarter
      ? normalized.map(({ filename, language, content }) => ({ filename, language, content }))
      : null,
  };
}
