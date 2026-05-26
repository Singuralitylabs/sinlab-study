import type { CodeFile, Json } from "@/app/types";

/**
 * 提出データを表示・AIレビュー用のファイル配列に正規化する。
 *
 * 後方互換性:
 *   - code_files（複数ファイル）があればそれを返す
 *   - なければ code_content（単一ファイル）を1要素の配列として返す
 *   - どちらも空なら空配列を返す
 *
 * クライアント/サーバー双方から利用するため、副作用のない純粋関数として実装する。
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
