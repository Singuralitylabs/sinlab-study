import {
  EMAIL_FROM_NAME,
  EMAIL_SEND_TIMEOUT_MS,
  RESEND_API_URL,
} from "@/app/constants/notifications";

/** テンプレート関数が返すメール1通分の内容 */
export type EmailContent = {
  subject: string;
  text: string;
  html: string;
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
 * メール送信に必要な環境変数（`RESEND_API_KEY` / `EMAIL_FROM_ADDRESS`）がそろっているか。
 * 未設定時のスキップ（warn ログ）は送信の入口（`user-emails.ts` の `deliverToUser()`）の
 * 1箇所で判定し、宛先の読み込み・送信ログの claim より前に打ち切る（未設定の環境で
 * 送信ログだけが積み上がらないようにする）。
 */
export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null;
}

/**
 * Resend の REST API でメールを1通送る。Slack 通知（`postSlackWebhook()`）と同じ方針で、
 * 送信失敗（非2xx・タイムアウト・例外）はログに残して `failed` を返し、例外は一切 throw しない
 * （呼び出し元の主処理へ伝播させない）。送信設定の有無は呼び出し元が `isEmailConfigured()` で
 * 判定済みであることを前提とし、未設定で呼ばれた場合も `failed` を返す。
 *
 * `RESEND_API_KEY` はリクエストヘッダにのみ載せ、戻り値・ログには含めない。
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
