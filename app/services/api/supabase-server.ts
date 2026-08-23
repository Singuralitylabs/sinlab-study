import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type SupabaseClientLike = ReturnType<typeof createClient> | ReturnType<typeof createServerClient>;

// サーバーサイド用Supabaseクライアント（認証付き）
export async function createServerSupabaseClient(): Promise<SupabaseClientLike> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !key && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Supabase環境変数が未設定です: ${missing}`);
  }
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
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
// レイアウトで権限チェック済みの管理者・講師向けクエリに使用
export async function createAdminSupabaseClient(): Promise<SupabaseClientLike> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      throw new Error("Supabase環境変数が未設定です: NEXT_PUBLIC_SUPABASE_URL");
    }
    return createClient(url, serviceRoleKey);
  }
  // Service Role Key未設定時は通常クライアントにフォールバック
  return createServerSupabaseClient();
}
