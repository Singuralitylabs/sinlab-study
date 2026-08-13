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
