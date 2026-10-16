import type { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

type AdminClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const USER_AGENT_MAX = 500;

function clipUserAgent(userAgent: string | null): string | null {
  if (!userAgent) {
    return null;
  }
  return userAgent.slice(0, USER_AGENT_MAX);
}

/**
 * Upserts by endpoint for the authenticated user only. An endpoint already owned by someone
 * else is left untouched: the browser key must not be used to take over another account.
 */
export async function savePushSubscription(
  supabase: AdminClient,
  userId: number,
  input: PushSubscriptionInput,
  userAgent: string | null
): Promise<"saved" | "conflict" | "failed"> {
  const now = new Date().toISOString();
  const agent = clipUserAgent(userAgent);
  const { data: existing, error: readError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id")
    .eq("endpoint", input.endpoint)
    .maybeSingle();
  if (readError) {
    console.error("[Web Push] 購読の確認に失敗しました:", readError.message);
    return "failed";
  }
  if (existing && existing.user_id !== userId) {
    return "conflict";
  }

  if (existing) {
    const { error } = await supabase
      .from("push_subscriptions")
      .update({
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        user_agent: agent,
        last_used_at: now,
        disabled_at: null,
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) {
      console.error("[Web Push] 購読の更新に失敗しました:", error.message);
      return "failed";
    }
    return "saved";
  }

  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: agent,
    last_used_at: now,
  });
  if (!error) {
    return "saved";
  }
  if (error.code !== "23505") {
    console.error("[Web Push] 購読の保存に失敗しました:", error.message);
    return "failed";
  }

  const { data: raced } = await supabase
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", input.endpoint)
    .maybeSingle();
  if (!raced || raced.user_id !== userId) {
    return "conflict";
  }
  const { error: updateError } = await supabase
    .from("push_subscriptions")
    .update({
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      user_agent: agent,
      last_used_at: now,
      disabled_at: null,
    })
    .eq("endpoint", input.endpoint)
    .eq("user_id", userId);
  if (updateError) {
    console.error("[Web Push] 購読の更新に失敗しました:", updateError.message);
    return "failed";
  }
  return "saved";
}

/** Deletes only the caller's row. Another user's endpoint is a no-op, not an error. */
export async function deletePushSubscription(
  supabase: AdminClient,
  userId: number,
  endpoint: string
): Promise<"deleted" | "failed"> {
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", userId);
  if (error) {
    console.error("[Web Push] 購読の削除に失敗しました:", error.message);
    return "failed";
  }
  return "deleted";
}
