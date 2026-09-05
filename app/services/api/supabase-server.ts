import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
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
// 未設定時は通常クライアントへフォールバックするため、Cookie の無い文脈では
// 呼び出す前に SUPABASE_SERVICE_ROLE_KEY の存在を確認すること。
export async function createAdminSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      throw new Error("Supabase環境変数が設定されていません: NEXT_PUBLIC_SUPABASE_URL");
    }
    return createClient(url, serviceRoleKey);
  }
  // Service Role Key未設定時は通常クライアントにフォールバック
  return createServerSupabaseClient();
}
