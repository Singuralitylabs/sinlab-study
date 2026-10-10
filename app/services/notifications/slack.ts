import { SLACK_WEBHOOK_TIMEOUT_MS } from "@/app/constants/notifications";

/**
 * Shared Slack webhook block sender. Skips when the URL is unset; failures (non-2xx, exceptions)
 * are swallowed and never propagate to the caller's main processing (approval request, Stripe
 * webhook, etc.).
 */
async function postSlackWebhook(
  body: { blocks: unknown[] },
  onSuccess?: () => void
): Promise<void> {
  const webhookUrl = process.env.SLACK_NOTIFICATION_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("[Slack通知] SLACK_NOTIFICATION_WEBHOOK_URL が未設定のため通知をスキップしました");
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SLACK_WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[Slack通知] Webhook POSTが失敗しました: status=${response.status}`);
      return;
    }

    onSuccess?.();
  } catch (error) {
    console.error("[Slack通知] Webhook POSTでエラーが発生しました:", error);
  }
}

type NewUserNotificationParams = {
  displayName: string;
  email: string;
  adminUsersUrl: string;
};

export async function sendSlackNewUserNotification(
  params: NewUserNotificationParams
): Promise<void> {
  const registeredAt = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const body = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔔 新規ユーザーが承認を待っています",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*表示名*",
          },
          {
            type: "plain_text",
            text: params.displayName,
          },
          {
            type: "mrkdwn",
            text: "*メール*",
          },
          {
            type: "plain_text",
            text: params.email,
          },
          {
            type: "mrkdwn",
            text: "*登録日時*",
          },
          {
            type: "plain_text",
            text: `${registeredAt} (JST)`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "管理画面を開く",
              emoji: true,
            },
            url: params.adminUsersUrl,
            style: "primary",
          },
        ],
      },
    ],
  };

  await postSlackWebhook(body, () => {
    console.log("[Slack通知] 承認依頼通知を送信しました:", params.email); // allow-console
  });
}

type PaymentFailedNotificationParams = {
  customerEmail: string | null;
  amountDue: number;
  hostedInvoiceUrl: string | null;
};

/**
 * Notifies operators only: the first payment failure does not demote the user and is left to
 * Smart Retries.
 */
export async function sendSlackPaymentFailedNotification(
  params: PaymentFailedNotificationParams
): Promise<void> {
  const body = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ Stripeの支払いに失敗しました",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*メール*",
          },
          {
            type: "plain_text",
            text: params.customerEmail ?? "不明",
          },
          {
            type: "mrkdwn",
            text: "*請求額*",
          },
          {
            type: "plain_text",
            // JPY is a zero-decimal currency in Stripe, so amount_due is already yen
            // (multi-currency out of scope).
            text: `${params.amountDue.toLocaleString("ja-JP")}円`,
          },
        ],
      },
      ...(params.hostedInvoiceUrl
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "請求書を開く",
                    emoji: true,
                  },
                  url: params.hostedInvoiceUrl,
                },
              ],
            },
          ]
        : []),
    ],
  };

  await postSlackWebhook(body);
}

type CheckoutRecoveryNotificationParams = {
  userId: number | null;
  reason: string;
  sessionIds: string[];
};

/**
 * Notice for a Checkout of this app that cannot be reflected automatically: the Checkout API's
 * self-recovery gave up (the user keeps getting 409), or the webhook permanently refused a
 * completed session (the user may have paid yet stays on trial). Either needs manual handling, so
 * tell operators, not just the log.
 */
export async function sendSlackCheckoutRecoveryNotification(
  params: CheckoutRecoveryNotificationParams
): Promise<void> {
  const body = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ 決済済みのCheckoutを自動で反映できませんでした",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: "*ユーザーID*" },
          { type: "plain_text", text: params.userId === null ? "不明" : String(params.userId) },
          { type: "mrkdwn", text: "*理由*" },
          { type: "plain_text", text: params.reason },
          { type: "mrkdwn", text: "*Checkoutセッション*" },
          { type: "plain_text", text: params.sessionIds.join(", ") || "-" },
        ],
      },
    ],
  };

  await postSlackWebhook(body);
}
