import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

/**
 * Own `display_name`. Normal client: own-row SELECT is already allowed by RLS, so the settings
 * screen does not need service_role to read it.
 */
export async function fetchUserDisplayName(
  userId: number
): Promise<{ data: string | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("表示名の取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data?.display_name ?? null, error: null };
}

/**
 * Writes only `display_name` on the caller's row. users UPDATE RLS is admin-only, so this goes
 * through service_role; a member self-UPDATE policy would also let them rewrite role / status.
 * Issued certificates keep `recipient_name` and are not touched here.
 */
export async function updateUserDisplayName(
  userId: number,
  displayName: string
): Promise<{ data: string | null; error: PostgrestError | null }> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .update({ display_name: displayName })
    .eq("id", userId)
    .eq("is_deleted", false)
    .select("display_name")
    .maybeSingle();

  if (error) {
    console.error("表示名の更新エラー:", error.message);
    return { data: null, error };
  }

  return { data: data?.display_name ?? null, error: null };
}
