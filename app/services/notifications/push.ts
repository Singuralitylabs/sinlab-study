import { sendNotification, setVapidDetails } from "web-push";
import { EMAIL_KIND, PUSH_KINDS, type PushKind } from "@/app/constants/notifications";
import { runAfterResponse } from "@/app/lib/after-response";
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

/**
 * Claims `push_logs` then sends `{ title, body, url }` to every live subscription of `userId`.
 * A UNIQUE violation means this event was already claimed, so nothing is sent. 404 / 410 disable
 * that subscription. Any other failure is stored on the log and swallowed: callers (approval,
 * cron, announcement broadcast) must keep their own result.
 */
export async function sendPushToUser(
  userId: number,
  kind: PushKind,
  referenceKey: string,
  payload: PushPayload,
  supabase?: AdminClient
): Promise<PushDeliverResult> {
  const config = readConfig();
  if (!config || !PUSH_KIND_SET.has(kind) || !isAppPath(payload.url)) {
    return "skipped";
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
    await recordLog(client, claimed.id, { error: "購読の取得に失敗しました" });
    console.error("[Web Push] 購読の取得に失敗しました:", listError.message);
    return "failed";
  }

  const live = subscriptions ?? [];
  if (live.length === 0) {
    await recordLog(client, claimed.id, { error: "有効な購読がありません" });
    return "skipped";
  }

  setVapidDetails(config.subject, config.publicKey, config.privateKey);
  let sent = 0;
  const failures: string[] = [];
  for (const subscription of live) {
    try {
      await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url })
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
        const { error: disableError } = await client
          .from("push_subscriptions")
          .update({ disabled_at: new Date().toISOString() })
          .eq("id", subscription.id)
          .eq("user_id", userId);
        if (disableError) {
          console.error("[Web Push] 購読の無効化に失敗しました:", disableError.message);
        }
        failures.push(String(status));
      } else {
        console.error("[Web Push] 送信に失敗しました:", publicError(error));
        failures.push(status === null ? "send failed" : String(status));
      }
    }
  }

  if (sent > 0) {
    await recordLog(client, claimed.id, { sent_at: new Date().toISOString(), error: null });
    return "sent";
  }
  await recordLog(client, claimed.id, { error: failures.join(",") || "send failed" });
  return "failed";
}

async function recordLog(
  client: AdminClient,
  id: number,
  patch: { sent_at?: string; error: string | null }
): Promise<void> {
  const { error } = await client.from("push_logs").update(patch).eq("id", id);
  if (error) {
    console.error("[Web Push] push_logs 更新エラー:", error.message);
  }
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
