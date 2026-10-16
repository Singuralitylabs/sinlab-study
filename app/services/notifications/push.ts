import { sendNotification, setVapidDetails } from "web-push";
import {
  EMAIL_KIND,
  PUSH_KINDS,
  type PushKind,
  WEB_PUSH_SEND_TIMEOUT_MS,
} from "@/app/constants/notifications";
import { runAfterResponse } from "@/app/lib/after-response";
import { isAllowedPushEndpoint } from "@/app/lib/push-endpoint";
import type { PushPayload } from "@/app/lib/push-targets";
import { isWebPushConfigured } from "@/app/lib/web-push-config";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";

type AdminClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export type PushDeliverResult = "sent" | "duplicate" | "skipped" | "failed";

const PUSH_KIND_SET = new Set<string>(PUSH_KINDS);

function readConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  if (!isWebPushConfigured()) {
    return null;
  }
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey || !subject) {
    return null;
  }
  return { publicKey, privateKey, subject };
}

/** Drop the private key if a library error echoes it. Endpoints are not logged either. */
function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "push send failed";
  const secret = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const redacted = secret ? message.split(secret).join("[redacted]") : message;
  return redacted.slice(0, 300);
}

function statusCodeOf(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const code = (error as { statusCode: unknown }).statusCode;
    return typeof code === "number" ? code : null;
  }
  return null;
}

function isAppPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !/\s/.test(url);
}

async function releaseClaim(client: AdminClient, id: number): Promise<void> {
  const { error } = await client.from("push_logs").delete().eq("id", id);
  if (error) {
    console.error("[Web Push] push_logs 解放エラー:", error.message);
  }
}

async function disableSubscription(
  client: AdminClient,
  userId: number,
  subscriptionId: number
): Promise<void> {
  const { error } = await client
    .from("push_subscriptions")
    .update({ disabled_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .eq("user_id", userId);
  if (error) {
    console.error("[Web Push] 購読の無効化に失敗しました:", error.message);
  }
}

export type PushSendDeadline = {
  started: number;
  budgetMs: number;
  clock?: () => number;
};

/**
 * Claims `push_logs` then sends `{ title, body, url }` to every live subscription of `userId`.
 * VAPID is configured before the claim so a bad key does not leave a stuck log row. A UNIQUE
 * violation means this event was already claimed. Total failure (no delivery) deletes the claim
 * so a later run can retry. 404 / 410 / disallowed endpoints disable that subscription. Any other
 * per-subscription failure is swallowed: callers must keep their own result.
 * Optional `deadline` stops the per-subscription loop so a many-endpoint user cannot hold cron.
 */
export async function sendPushToUser(
  userId: number,
  kind: PushKind,
  referenceKey: string,
  payload: PushPayload,
  supabase?: AdminClient,
  deadline?: PushSendDeadline
): Promise<PushDeliverResult> {
  const config = readConfig();
  if (!config || !PUSH_KIND_SET.has(kind) || !isAppPath(payload.url)) {
    return "skipped";
  }

  try {
    setVapidDetails(config.subject, config.publicKey, config.privateKey);
  } catch (error) {
    console.error("[Web Push] VAPID 設定に失敗しました:", publicError(error));
    return "failed";
  }

  const client = supabase ?? (await createAdminSupabaseClient());
  const { data: claimed, error: claimError } = await client
    .from("push_logs")
    .insert({ user_id: userId, kind, reference_key: referenceKey })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      return "duplicate";
    }
    console.error("[Web Push] push_logs claim エラー:", claimError.message);
    return "failed";
  }

  const { data: subscriptions, error: listError } = await client
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .is("disabled_at", null);

  if (listError) {
    await releaseClaim(client, claimed.id);
    console.error("[Web Push] 購読の取得に失敗しました:", listError.message);
    return "failed";
  }

  const live = subscriptions ?? [];
  if (live.length === 0) {
    await releaseClaim(client, claimed.id);
    return "skipped";
  }

  let sent = 0;
  const clock = deadline?.clock ?? Date.now;
  for (const subscription of live) {
    // Digest shares this budget across users; stop mid-loop so one account cannot stall cron.
    if (deadline && clock() - deadline.started >= deadline.budgetMs) {
      break;
    }
    if (!isAllowedPushEndpoint(subscription.endpoint)) {
      await disableSubscription(client, userId, subscription.id);
      continue;
    }
    try {
      await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url }),
        { timeout: WEB_PUSH_SEND_TIMEOUT_MS }
      );
      sent += 1;
      const { error: touchError } = await client
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", subscription.id)
        .eq("user_id", userId);
      if (touchError) {
        console.error("[Web Push] last_used_at の更新に失敗しました:", touchError.message);
      }
    } catch (error) {
      const status = statusCodeOf(error);
      if (status === 404 || status === 410) {
        await disableSubscription(client, userId, subscription.id);
      } else {
        console.error("[Web Push] 送信に失敗しました:", publicError(error));
      }
    }
  }

  if (sent > 0) {
    const { error } = await client
      .from("push_logs")
      .update({ sent_at: new Date().toISOString(), error: null })
      .eq("id", claimed.id);
    if (error) {
      console.error("[Web Push] push_logs 更新エラー:", error.message);
    }
    return "sent";
  }
  // No delivery: drop the claim so inactivity / trial day keys and announcements can retry.
  await releaseClaim(client, claimed.id);
  return "failed";
}

/**
 * Same hook as the approval email: only after approveUser() actually updated. Failures stay
 * inside after() so the admin response is unchanged. `push_enabled` is fail-closed.
 */
export function scheduleApprovedPush(params: { userId: number; approvedAt: string }): void {
  void runAfterResponse(async () => {
    try {
      if (!isWebPushConfigured()) {
        return;
      }
      const supabase = await createAdminSupabaseClient();
      const { data, error } = await supabase
        .from("email_kind_settings")
        .select("push_enabled")
        .eq("kind", EMAIL_KIND.APPROVED)
        .maybeSingle();
      if (error || data?.push_enabled !== true) {
        return;
      }
      await sendPushToUser(
        params.userId,
        EMAIL_KIND.APPROVED,
        params.approvedAt,
        {
          title: "本登録が完了しました",
          body: "ダッシュボードから学習を続けられます",
          url: "/",
        },
        supabase
      );
    } catch (error) {
      console.error("[Web Push] 承認通知でエラーが発生しました:", publicError(error));
    }
  }).catch((error: unknown) => {
    console.error("[Web Push] 承認通知の予約に失敗しました:", publicError(error));
  });
}
