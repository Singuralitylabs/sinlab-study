import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// サーバーサイド用Supabaseクライアント（認証付き）
export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // 第2引数 headers（Cache-Control 等）は next/headers 経由ではレスポンスに設定できないため受け取らない。
      // トークン更新は通常 proxy.ts で先に行われ、そちらでヘッダーを付与している
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // サーバーコンポーネントで呼び出された場合のエラーハンドリング
        }
      },
    },
  });
}

// サーバーサイド用Supabaseクライアント（Service Role: RLSバイパス）
// 管理者・講師向けの権限チェック済みクエリ、および通常クライアントでは RLS で
// 見えない行を読むサーバー処理（OAuthコールバックの users 存在確認）に使用。
// SUPABASE_SERVICE_ROLE_KEY 未設定時は throw する（通常クライアントへの暗黙フォールバックはしない）。
// RLS 適用の通常クライアントが必要な経路は、呼び出し側が createServerSupabaseClient() を明示的に選ぶ。
// キャッシュ変数は SupabaseClient（Database=any）で保持する。
// ReturnType<typeof createClient> だとフォールバック削除後に空スキーマ扱いになり、
// 呼び出し側の .from().update() 等が never になる（以前は createServerClient の any とのユニオンで隠れていた）。
let cachedAdminClient: SupabaseClient | null = null;

export async function createAdminSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が設定されていません。Service Role クライアントにはキーが必須です"
    );
  }
  if (cachedAdminClient) {
    return cachedAdminClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL");
  }
  cachedAdminClient = createClient(url, serviceRoleKey);
  return cachedAdminClient;
}
