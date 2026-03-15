import { type CookieOptions, createServerClient } from "@supabase/ssr";
import type { AuthError } from "@supabase/supabase-js";
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

/**
 * サーバーサイドで現在アクセスしている認証ユーザー情報（authId含む）を取得する
 * @returns 認証ユーザー情報（authIdなど）
 */
export async function getServerCurrentUser(): Promise<{
  authId: string;
  error: AuthError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    console.error("認証ユーザー情報取得エラー:", error?.message || "No data found");
    return { authId: "", error };
  }

  return { authId: data.user.id, error: null };
}
