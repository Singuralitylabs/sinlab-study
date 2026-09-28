import { after } from "next/server";
import { EMAIL_KIND, type EmailKind } from "@/app/constants/notifications";
import { formatMonthlyJpyPrice, isStripeEnabled } from "@/app/constants/stripe";
import { USER_MEMBERSHIP_LABELS } from "@/app/constants/user";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import {
  type EmailContent,
  isEmailConfigured,
  sendEmail,
} from "@/app/services/notifications/email";
import {
  buildApprovedEmail,
  buildCancelScheduledEmail,
  buildSignupEmail,
  buildSubscriptionEndedEmail,
  buildUpgradedEmail,
} from "@/app/services/notifications/email-templates";
import type { MembershipType } from "@/app/types";

type Recipient = { userId: number; email: string; displayName: string };

type DeliverParams = {
  kind: EmailKind;
  referenceKey: string;
  recipient: Recipient;
  content: EmailContent;
};

export type DeliverResult = "sent" | "duplicate" | "skipped" | "failed";

function getAppUrl(): string | null {
  return process.env.NEXT_PUBLIC_APP_URL || null;
}

function formatDateJst(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/**
 * `email_logs` への INSERT を処理権（claim）として確保してから1通送り、結果を同じ行に記録する。
 * UNIQUE (user_id, kind, reference_key) の違反（23505）は「同一事象を別の経路・再送が既に
 * 送った（または送信中）」ことを意味するため、送信しない。claim 自体が他のDBエラーで失敗した
 * 場合も、二重送信を防げないため送信しない。
 */
export async function deliverUserEmail(params: DeliverParams): Promise<DeliverResult> {
  if (!isEmailConfigured()) {
    console.warn(
      `[メール通知] RESEND_API_KEY または EMAIL_FROM_ADDRESS が未設定のため送信をスキップしました: kind=${params.kind}`
    );
    return "skipped";
  }
  if (!params.recipient.email) {
    console.warn(
      `[メール通知] 宛先メールアドレスが無いため送信をスキップしました: kind=${params.kind}`
    );
    return "skipped";
  }

  const supabase = await createAdminSupabaseClient();
  const { data: claimed, error: claimError } = await supabase
    .from("email_logs")
    .insert({
      user_id: params.recipient.userId,
      kind: params.kind,
      reference_key: params.referenceKey,
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      return "duplicate";
    }
    console.error("[メール通知] email_logs claim エラー:", claimError.message);
    return "failed";
  }

  const result = await sendEmail({ to: params.recipient.email, ...params.content });

  const { error: logError } = await supabase
    .from("email_logs")
    .update(
      result.status === "sent"
        ? { sent_at: new Date().toISOString(), provider_message_id: result.messageId }
        : { error: result.status === "failed" ? result.error : "送信をスキップしました" }
    )
    .eq("id", claimed.id);

  if (logError) {
    console.error("[メール通知] email_logs 更新エラー:", logError.message);
  }

  return result.status === "sent" ? "sent" : "failed";
}

async function fetchRecipient(
  by: { column: "id"; value: number } | { column: "auth_id"; value: string }
): Promise<Recipient | null> {
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, display_name")
    .eq(by.column, by.value)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    console.error("[メール通知] 宛先ユーザー取得エラー:", error.message);
    return null;
  }
  if (!data) {
    return null;
  }
  return { userId: data.id, email: data.email, displayName: data.display_name };
}

/**
 * メール送信をレスポンス返却後に回す。`after()` はサーバーレス関数の終了まで処理を延長するため、
 * 送信がレスポンスを遅らせず、かつ途中で打ち切られない。リクエストスコープ外（`after()` が
 * throw する経路）では、その場で発火だけ行う。いずれも例外は握りつぶし、呼び出し元の主処理
 * （登録・承認・Stripe Webhook・/upgrade/success）の結果・レスポンスには一切影響させない。
 */
function scheduleEmail(label: EmailKind, task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[メール通知] 予期しないエラーが発生しました: kind=${label}`, error);
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * 宛先を読み込み、テンプレートを組み立てて送る共通手順。送信設定・アプリURLが無い環境では
 * 宛先の読み込みより前にスキップする（本文のリンクは `NEXT_PUBLIC_APP_URL` 起点でのみ作る）。
 */
async function deliverToUser(
  kind: EmailKind,
  referenceKey: string | ((recipient: Recipient) => string),
  loadRecipient: () => Promise<Recipient | null>,
  build: (recipient: Recipient, appUrl: string) => EmailContent
): Promise<DeliverResult> {
  if (!isEmailConfigured()) {
    console.warn(
      `[メール通知] RESEND_API_KEY または EMAIL_FROM_ADDRESS が未設定のため送信をスキップしました: kind=${kind}`
    );
    return "skipped";
  }
  const appUrl = getAppUrl();
  if (!appUrl) {
    console.warn(
      `[メール通知] NEXT_PUBLIC_APP_URL が未設定のため送信をスキップしました: kind=${kind}`
    );
    return "skipped";
  }

  const recipient = await loadRecipient();
  if (!recipient) {
    console.warn(`[メール通知] 宛先ユーザーが見つからないため送信をスキップしました: kind=${kind}`);
    return "skipped";
  }

  return await deliverUserEmail({
    kind,
    referenceKey: typeof referenceKey === "string" ? referenceKey : referenceKey(recipient),
    recipient,
    content: build(recipient, appUrl),
  });
}

/**
 * 初回登録（`users` の INSERT 成功後）のようこそメール。reference_key は `users.id`。
 * callback の INSERT は通常クライアント（RLS適用）で行い id を返さないため、`auth_id` で引き直す
 */
export function scheduleSignupEmail(params: { authId: string }): void {
  scheduleEmail(EMAIL_KIND.SIGNUP, () =>
    deliverToUser(
      EMAIL_KIND.SIGNUP,
      (recipient) => String(recipient.userId),
      () => fetchRecipient({ column: "auth_id", value: params.authId }),
      (recipient, appUrl) =>
        buildSignupEmail({
          displayName: recipient.displayName,
          appUrl,
          upgradeAvailable: isStripeEnabled(),
        })
    )
  );
}

/** 管理者の承認（`approveUser()` が更新したとき）。reference_key は承認時刻（ISO文字列） */
export function scheduleApprovedEmail(params: {
  userId: number;
  membershipType: MembershipType;
  approvedAt: string;
}): void {
  scheduleEmail(EMAIL_KIND.APPROVED, () =>
    deliverToUser(
      EMAIL_KIND.APPROVED,
      params.approvedAt,
      () => fetchRecipient({ column: "id", value: params.userId }),
      (recipient, appUrl) =>
        buildApprovedEmail({
          displayName: recipient.displayName,
          appUrl,
          membershipLabel: USER_MEMBERSHIP_LABELS[params.membershipType],
        })
    )
  );
}

/**
 * 一般有料会員化（`activateUserFromCheckoutSession()` が昇格したとき）。Webhook と
 * /upgrade/success の両方から呼ばれるため、reference_key の `stripe_subscription_id` で1通に抑える。
 *
 * @param monthlyAmountJpy Stripe から取り直したサブスクの実請求額。JPY の月額で確認できない
 *   場合は null を渡し、料金の行を載せない（`DISPLAY_MONTHLY_PRICE_JPY` では代用しない）
 */
export function scheduleUpgradedEmail(params: {
  userId: number;
  subscriptionId: string;
  monthlyAmountJpy: number | null;
  currentPeriodEnd: string | null;
}): void {
  scheduleEmail(EMAIL_KIND.UPGRADED, () =>
    deliverToUser(
      EMAIL_KIND.UPGRADED,
      params.subscriptionId,
      () => fetchRecipient({ column: "id", value: params.userId }),
      (recipient, appUrl) =>
        buildUpgradedEmail({
          displayName: recipient.displayName,
          appUrl,
          monthlyPriceLabel:
            params.monthlyAmountJpy !== null
              ? formatMonthlyJpyPrice(params.monthlyAmountJpy)
              : null,
          nextBillingDateLabel: params.currentPeriodEnd
            ? formatDateJst(params.currentPeriodEnd)
            : null,
        })
    )
  );
}

/** 解約予約（`cancel_at_period_end` が false → true）。reference_key は `stripe_subscription_id` */
export function scheduleCancelScheduledEmail(params: {
  userId: number;
  subscriptionId: string;
  currentPeriodEnd: string | null;
}): void {
  scheduleEmail(EMAIL_KIND.CANCEL_SCHEDULED, () =>
    deliverToUser(
      EMAIL_KIND.CANCEL_SCHEDULED,
      params.subscriptionId,
      () => fetchRecipient({ column: "id", value: params.userId }),
      (recipient, appUrl) =>
        buildCancelScheduledEmail({
          displayName: recipient.displayName,
          appUrl,
          periodEndDateLabel: params.currentPeriodEnd
            ? formatDateJst(params.currentPeriodEnd)
            : null,
        })
    )
  );
}

/** 有料会員の終了（`revertUserToTrial()` が実際に降格したとき）。reference_key は `stripe_subscription_id` */
export function scheduleSubscriptionEndedEmail(params: {
  userId: number;
  subscriptionId: string;
}): void {
  scheduleEmail(EMAIL_KIND.SUBSCRIPTION_ENDED, () =>
    deliverToUser(
      EMAIL_KIND.SUBSCRIPTION_ENDED,
      params.subscriptionId,
      () => fetchRecipient({ column: "id", value: params.userId }),
      (recipient, appUrl) =>
        buildSubscriptionEndedEmail({ displayName: recipient.displayName, appUrl })
    )
  );
}
