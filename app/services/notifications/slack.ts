type NewUserNotificationParams = {
  displayName: string;
  email: string;
  adminUsersUrl: string;
};

export async function sendSlackNewUserNotification(
  params: NewUserNotificationParams
): Promise<void> {
  const webhookUrl = process.env.SLACK_NOTIFICATION_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("[Slack通知] SLACK_NOTIFICATION_WEBHOOK_URL が未設定のため通知をスキップしました");
    return;
  }

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
            text: `*表示名*\n${params.displayName}`,
          },
          {
            type: "mrkdwn",
            text: `*メール*\n${params.email}`,
          },
          {
            type: "mrkdwn",
            text: `*登録日時*\n${registeredAt} (JST)`,
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

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`[Slack通知] Webhook POSTが失敗しました: status=${response.status}`);
      return;
    }

    console.log("[Slack通知] 承認依頼通知を送信しました:", params.email);
  } catch (error) {
    console.error("[Slack通知] Webhook POSTでエラーが発生しました:", error);
  }
}
