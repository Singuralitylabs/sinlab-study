import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

/**
 * Promotional-mail unsubscribe state, set by an admin on the user's behalf (`opt_out_email`, e.g.
 * on the user's request) or reverted (`resume_email`). Guarded in the UPDATE so a stale screen
 * cannot overwrite the original unsubscribe time or resume someone who is not unsubscribed;
 * `updated: false` means the target was already in that state, missing or deleted. Transactional
 * mail never reads this column. Not tied to the user's status, so it works for any user.
 */
export async function setUserEmailOptOut(
  userId: number,
  optOut: boolean
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createAdminSupabaseClient();

  const query = supabase
    .from("users")
    .update({ email_opt_out_at: optOut ? new Date().toISOString() : null })
    .eq("id", userId)
    .eq("is_deleted", false);
  const { data, error } = await (optOut
    ? query.is("email_opt_out_at", null)
    : query.not("email_opt_out_at", "is", null)
  ).select("id");

  if (error) {
    console.error("メール配信停止状態の更新エラー:", error.message);
    return { error, updated: false };
  }

  return { error: null, updated: (data?.length ?? 0) > 0 };
}

/**
 * Own `email_opt_out_at` (NULL = receiving). Normal client: own-row SELECT is already allowed by
 * RLS, so no service_role read is needed for the settings screen.
 */
export async function fetchUserEmailOptOutAt(
  userId: number
): Promise<{ data: string | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("email_opt_out_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("メール配信設定の取得エラー:", error.message);
    return { data: null, error };
  }

  return { data: data?.email_opt_out_at ?? null, error: null };
}
