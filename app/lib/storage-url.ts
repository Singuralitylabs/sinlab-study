/**
 * DBに保存するSupabase Storageの相対パスを、画面表示用の完全URLへ解決する。
 * 既存の外部URL・public配下の相対パスは後方互換のためそのまま返す。
 */
export function resolveStorageUrl(url: string): string {
  if (!url.startsWith("/storage/")) {
    return url;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}${url}` : url;
}

const STORAGE_URL_PLACEHOLDER = /\{\{SUPABASE_STORAGE_URL\}\}/g;

/**
 * Markdown本文中の {{SUPABASE_STORAGE_URL}} プレースホルダを、Supabase Storageの
 * 公開オブジェクトURLプレフィックスへ置換する。管理画面で入力するMarkdown
 * （text_content・description等）から、環境非依存でStorage内の画像等を参照できるようにする。
 */
export function resolveMarkdownStorageUrls(content: string): string {
  return content.replace(STORAGE_URL_PLACEHOLDER, resolveStorageUrl("/storage/v1/object/public"));
}
