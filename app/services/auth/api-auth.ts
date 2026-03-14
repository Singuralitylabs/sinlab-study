import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

interface ApiAuthResult {
  userId: number;
  authId: string;
}

/**
 * APIルート用の認証チェック
 */
export async function getApiAuth(): Promise<
  { success: true; data: ApiAuthResult } | { success: false; error: string; status: number }
> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "認証が必要です", status: 401 };
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .eq("is_deleted", false)
    .single();

  if (userError || !userData) {
    return {
      success: false,
      error: "ユーザー情報が見つかりません",
      status: 403,
    };
  }

  return { success: true, data: { userId: userData.id, authId: user.id } };
}

/**
 * APIルート用のSupabaseクライアントを取得
 */
export async function getApiSupabaseClient() {
  return createServerSupabaseClient();
}
