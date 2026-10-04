import { after } from "next/server";
import { EMAIL_KIND, type EmailKind } from "@/app/constants/notifications";
import { formatMonthlyJpyPrice, isStripeEnabled } from "@/app/constants/stripe";
import { USER_MEMBERSHIP_LABELS } from "@/app/constants/user";
import type { EmailTexts } from "@/app/lib/email-template";
import { formatDate } from "@/app/lib/format-date";
import { isTransactionalEmailEnabled } from "@/app/services/api/email-settings-server";
import { loadEmailTexts } from "@/app/services/api/email-templates-server";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import {
  type EmailContent,
  isEmailConfigured,
  sendEmail,
} from "@/app/services/notifications/email";
import {
  buildApprovedEmail,
  buildCancelScheduledEmail,
  buildCertificateIssuedEmail,
  buildSignupEmail,
  buildSubscriptionEndedEmail,
  buildUpgradedEmail,
} from "@/app/services/notifications/email-templates";
import type { MembershipType } from "@/app/types";

export type AdminClient = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export type Recipient = { userId: number; email: string; displayName: string };

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

/**
 * Claims by INSERTing into `email_logs`, then sends one email and records the result on the same
 * row. A UNIQUE (user_id, kind, reference_key) violation (23505) means another path / retry
 * already sent (or is sending) the same event, so do not send. If the claim fails with another DB
 * error, also do not send since double sending cannot be prevented.
 * Assumes the caller (the entry point `deliverToUser()`; `runEmailDigest()` for periodic mail)
 * already checked that sending is configured.
 */
export async function deliverUserEmail(
  supabase: AdminClient,
  params: DeliverParams
): Promise<DeliverResult> {
  if (!params.recipient.email) {
    console.warn(
      `[メール通知] 宛先メールアドレスが無いため送信をスキップしました: kind=${params.kind}`
    );
    return "skipped";
  }

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
        : { error: result.error }
    )
    .eq("id", claimed.id);

  if (logError) {
    console.error("[メール通知] email_logs 更新エラー:", logError.message);
  }

  return result.status === "sent" ? "sent" : "failed";
}

type RecipientLookup = { column: "id"; value: number } | { column: "auth_id"; value: string };

async function fetchRecipient(
  supabase: AdminClient,
  by: RecipientLookup
): Promise<Recipient | null> {
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
 * Defers email sending until after the response. `after()` extends the serverless function until
 * it finishes, so sending neither delays the response nor is cut off. Outside request scope
 * (where `after()` throws) it just fires immediately. Exceptions are always swallowed so the
 * caller's main work (signup, approval, Stripe webhook, /upgrade/success) is never affected.
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
 * Shared entry: load the recipient, build the template, send. Skips before loading the recipient
 * when the kind is disabled in email_kind_settings, or when sending or the app URL is not configured (links are built only from
 * `NEXT_PUBLIC_APP_URL`). Recipient loading and the send-log claim/record use the same admin
 * client.
 */
async function deliverToUser(
  kind: EmailKind,
  referenceKey: string | ((recipient: Recipient) => string),
  recipientLookup: RecipientLookup,
  build: (recipient: Recipient, appUrl: string, texts: EmailTexts) => EmailContent
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

  const supabase = await createAdminSupabaseClient();
  // Fail-safe: an unreadable setting counts as enabled so signup / payment notices are not lost.
  if (!(await isTransactionalEmailEnabled(supabase, kind))) {
    console.warn(`[メール通知] 管理設定で無効のため送信をスキップしました: kind=${kind}`);
    return "skipped";
  }
  const recipient = await fetchRecipient(supabase, recipientLookup);
  if (!recipient) {
    console.warn(`[メール通知] 宛先ユーザーが見つからないため送信をスキップしました: kind=${kind}`);
    return "skipped";
  }

  // Fail-safe: loadEmailTexts() never throws and falls back to the code defaults, so an unreadable
  // text or branding row cannot stop the notice or affect the caller's main work.
  const texts = await loadEmailTexts(supabase);

  return await deliverUserEmail(supabase, {
    kind,
    referenceKey: typeof referenceKey === "string" ? referenceKey : referenceKey(recipient),
    recipient,
    content: build(recipient, appUrl, texts),
  });
}

/**
 * Welcome email after the initial signup INSERT into `users`; reference_key is `users.id`. The
 * callback INSERT uses the normal client (RLS) and does not return the id, so re-query by
 * `auth_id`.
 */
export function scheduleSignupEmail(params: { authId: string }): void {
  scheduleEmail(EMAIL_KIND.SIGNUP, () =>
    deliverToUser(
      EMAIL_KIND.SIGNUP,
      (recipient) => String(recipient.userId),
      { column: "auth_id", value: params.authId },
      (recipient, appUrl, texts) =>
        buildSignupEmail(
          {
            displayName: recipient.displayName,
            appUrl,
            upgradeAvailable: isStripeEnabled(),
          },
          texts
        )
    )
  );
}

/** Admin approval (when approveUser() updated). reference_key is the approval time (ISO string). */
export function scheduleApprovedEmail(params: {
  userId: number;
  membershipType: MembershipType;
  approvedAt: string;
}): void {
  scheduleEmail(EMAIL_KIND.APPROVED, () =>
    deliverToUser(
      EMAIL_KIND.APPROVED,
      params.approvedAt,
      { column: "id", value: params.userId },
      (recipient, appUrl, texts) =>
        buildApprovedEmail(
          {
            displayName: recipient.displayName,
            appUrl,
            membershipLabel: USER_MEMBERSHIP_LABELS[params.membershipType],
          },
          texts
        )
    )
  );
}

/**
 * Paid membership (when activateUserFromCheckoutSession() promoted). Called from both the webhook
 * and /upgrade/success, so reference_key `stripe_subscription_id` limits it to one email.
 * @param monthlyAmountJpy actual charged amount of the subscription re-fetched from Stripe. Pass
 *   null when it cannot be confirmed as a JPY monthly amount and the price line is omitted (never
 *   substitute DISPLAY_MONTHLY_PRICE_JPY).
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
      { column: "id", value: params.userId },
      (recipient, appUrl, texts) =>
        buildUpgradedEmail(
          {
            displayName: recipient.displayName,
            appUrl,
            monthlyPriceLabel:
              params.monthlyAmountJpy !== null
                ? formatMonthlyJpyPrice(params.monthlyAmountJpy)
                : null,
            nextBillingDateLabel: params.currentPeriodEnd
              ? formatDate(params.currentPeriodEnd)
              : null,
          },
          texts
        )
    )
  );
}

/**
 * Scheduled cancellation (when the live state re-fetched from Stripe shows one; decided in
 * syncSubscriptionStatus()). reference_key is `stripe_subscription_id`.
 * @param periodEnd last date/time of access (`cancel_at`, else `current_period_end`)
 */
export function scheduleCancelScheduledEmail(params: {
  userId: number;
  subscriptionId: string;
  periodEnd: string | null;
}): void {
  scheduleEmail(EMAIL_KIND.CANCEL_SCHEDULED, () =>
    deliverToUser(
      EMAIL_KIND.CANCEL_SCHEDULED,
      params.subscriptionId,
      { column: "id", value: params.userId },
      (recipient, appUrl, texts) =>
        buildCancelScheduledEmail(
          {
            displayName: recipient.displayName,
            appUrl,
            periodEndDateLabel: params.periodEnd ? formatDate(params.periodEnd) : null,
          },
          texts
        )
    )
  );
}

/**
 * Paid membership ended (when revertUserToTrial() actually demoted). reference_key is
 * `stripe_subscription_id`.
 */
export function scheduleSubscriptionEndedEmail(params: {
  userId: number;
  subscriptionId: string;
}): void {
  scheduleEmail(EMAIL_KIND.SUBSCRIPTION_ENDED, () =>
    deliverToUser(
      EMAIL_KIND.SUBSCRIPTION_ENDED,
      params.subscriptionId,
      { column: "id", value: params.userId },
      (recipient, appUrl, texts) =>
        buildSubscriptionEndedEmail({ displayName: recipient.displayName, appUrl }, texts)
    )
  );
}

/**
 * Certificate issued (when issueCertificateIfEligible() inserted the row). reference_key is
 * `certificates.id`, so a retry or a second path never mails the same certificate twice.
 */
export function scheduleCertificateIssuedEmail(params: {
  userId: number;
  certificateId: number;
  themeName: string;
  certificateNo: string;
}): void {
  scheduleEmail(EMAIL_KIND.CERTIFICATE_ISSUED, () =>
    deliverToUser(
      EMAIL_KIND.CERTIFICATE_ISSUED,
      String(params.certificateId),
      { column: "id", value: params.userId },
      (recipient, appUrl, texts) =>
        buildCertificateIssuedEmail(
          {
            displayName: recipient.displayName,
            appUrl,
            certificateId: params.certificateId,
            themeName: params.themeName,
            certificateNo: params.certificateNo,
          },
          texts
        )
    )
  );
}
