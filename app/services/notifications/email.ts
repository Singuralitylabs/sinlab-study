import {
  EMAIL_FROM_NAME,
  EMAIL_SEND_TIMEOUT_MS,
  RESEND_API_URL,
} from "@/app/constants/notifications";

export type EmailContent = {
  subject: string;
  text: string;
  html: string;
  /** Headers attached to the email itself (e.g. `List-Unsubscribe` for promotional emails). */
  headers?: Record<string, string>;
};

export type SendEmailResult =
  | { status: "sent"; messageId: string | null }
  | { status: "failed"; error: string };

function getEmailConfig(): { apiKey: string; fromAddress: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  return apiKey && fromAddress ? { apiKey, fromAddress } : null;
}

/**
 * Whether the env vars needed for sending (`RESEND_API_KEY` / `EMAIL_FROM_ADDRESS`) are set. The
 * skip-when-unset (warn log) decision is made in one place, the send entry (`deliverToUser()` in
 * user-emails.ts), and stops before recipient loading and the send-log claim so unconfigured
 * environments do not accumulate send logs.
 */
export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null;
}

/**
 * Sends one email via the Resend REST API. Like Slack notifications (`postSlackWebhook()`),
 * failures (non-2xx, timeout, exception) are logged and return `failed`; it never throws (nothing
 * propagates to the caller's main work). Callers are assumed to have checked isEmailConfigured();
 * it also returns `failed` if called while unconfigured.
 * `RESEND_API_KEY` goes only in the request header and never in return values or logs.
 */
export async function sendEmail(params: { to: string } & EmailContent): Promise<SendEmailResult> {
  const config = getEmailConfig();
  if (!config) {
    return { status: "failed", error: "RESEND_API_KEY または EMAIL_FROM_ADDRESS が未設定です" };
  }
  const { apiKey, fromAddress } = config;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${EMAIL_FROM_NAME} <${fromAddress}>`,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
        ...(params.headers ? { headers: params.headers } : {}),
      }),
      signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = `Resend API がエラーを返しました: status=${response.status}`;
      console.error(`[メール通知] ${error}`);
      return { status: "failed", error };
    }

    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    return { status: "sent", messageId: typeof body?.id === "string" ? body.id : null };
  } catch (error) {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : "不明なエラーが発生しました";
    console.error("[メール通知] 送信でエラーが発生しました:", message);
    return { status: "failed", error: message };
  }
}
