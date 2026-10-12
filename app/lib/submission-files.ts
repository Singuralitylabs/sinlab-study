import type { CodeFile, Json } from "@/app/types";

/**
 * Normalizes a submission into a file array for display/AI review: code_files if present, else
 * code_content as a one-element array, else []. Kept as a pure function since both client and
 * server use it.
 */
export function getSubmissionCodeFiles(submission: {
  code_content: string | null;
  code_files: Json | null;
}): CodeFile[] {
  const raw = submission.code_files;

  if (Array.isArray(raw)) {
    const files = raw
      .filter((f): f is { [key: string]: Json | undefined } => typeof f === "object" && f !== null)
      .map((f) => ({
        filename: typeof f.filename === "string" ? f.filename : "",
        language: typeof f.language === "string" ? f.language : "",
        content: typeof f.content === "string" ? f.content : "",
      }))
      .filter((f) => f.content.length > 0);

    if (files.length > 0) {
      return files;
    }
  }

  if (submission.code_content) {
    return [{ filename: "", language: "", content: submission.code_content }];
  }

  return [];
}

/**
 * A single-file submission is stored in code_content, which has no language; the exercise's
 * language fills in so the model knows how to read e.g. SQL or Bash. Shared by the review route and
 * the grading dry run so both build the same prompt.
 */
export function withFallbackLanguage(
  files: readonly CodeFile[],
  fallbackLanguage: string | null | undefined
): CodeFile[] {
  if (files.length === 1 && !files[0].language && fallbackLanguage) {
    return [{ ...files[0], language: fallbackLanguage }];
  }
  return [...files];
}
