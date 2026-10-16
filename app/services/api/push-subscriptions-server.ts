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
 * Upserts by endpoint for the authenticated user. An endpoint already owned by someone else is
 * reassigned: the browser push endpoint belongs to the device, so the signed-in account takes it
 * over (shared-device account switch).
 */
export async function savePushSubscription(
  supabase: AdminClient,
  userId: number,
  input: PushSubscriptionInput,
  userAgent: string | null
): Promise<"saved" | "failed"> {
  const now = new Date().toISOString();
  const agent = clipUserAgent(userAgent);
  const fields = {
    user_id: userId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: agent,
    last_used_at: now,
    disabled_at: null as string | null,
  };

  const { data: existing, error: readError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id")
    .eq("endpoint", input.endpoint)
    .maybeSingle();
  if (readError) {
    console.error("[Web Push] 購読の確認に失敗しました:", readError.message);
    return "failed";
  }

  if (existing) {
    const { error } = await supabase
      .from("push_subscriptions")
      .update(fields)
      .eq("id", existing.id)
      .eq("endpoint", input.endpoint);
    if (error) {
      console.error("[Web Push] 購読の更新に失敗しました:", error.message);
      return "failed";
    }
    return "saved";
  }

  const { error } = await supabase.from("push_subscriptions").insert({
    ...fields,
    endpoint: input.endpoint,
  });
  if (!error) {
    return "saved";
  }
  if (error.code !== "23505") {
    console.error("[Web Push] 購読の保存に失敗しました:", error.message);
    return "failed";
  }

  // Concurrent insert: take over the raced row for this signed-in user.
  const { error: updateError } = await supabase
    .from("push_subscriptions")
    .update(fields)
    .eq("endpoint", input.endpoint);
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
