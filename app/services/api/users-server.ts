import type { PostgrestError } from "@supabase/supabase-js";
import type { UserStatusType } from "@/app/types";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * usersテーブルから指定のauth_idのユーザーのステータスを取得する（サーバーサイド用）
 */
export async function fetchUserStatusByIdInServer({
  authId,
}: {
  authId: string;
}): Promise<{ status: UserStatusType | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("users")
    .select("status")
    .eq("auth_id", authId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error || !data) {
    console.error("Supabase ユーザーステータス取得エラー:", error?.message || "No data found");
    return { status: null, error };
  }

  return { status: data.status as UserStatusType, error: null };
}
