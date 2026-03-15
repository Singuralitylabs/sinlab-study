import { createBrowserClient } from "@supabase/ssr";

// クライアントサイド用Supabaseクライアント
export function createClientSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }
  return createBrowserClient(url, key);
}
