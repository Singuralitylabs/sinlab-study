import { SLACK_WEBHOOK_TIMEOUT_MS } from "@/app/constants/notifications";

/**
 * Slack Webhookへのブロック送信を共通化する。
 * URL未設定時はスキップ、送信失敗（非2xx・例外）は握りつぶし、
 * 呼び出し元（承認依頼・Stripe Webhook等の主処理）には一切伝播させない。
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
 * Stripeの支払い失敗（invoice.payment_failed）通知。初回失敗ではユーザーを降格せず
 * Smart Retriesに任せるため、運用者への通知のみを行う。
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
            // JPYはStripeのゼロ decimal通貨のため amount_due がそのまま円単位（複数通貨対応はスコープ外）
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
