import type { NextRequest } from "next/server";
import { EMAIL_SERVICE_NAME } from "@/app/constants/notifications";
import { escapeHtml } from "@/app/lib/escape-html";
import {
  confirmNotificationEmail,
  previewNotificationEmailLink,
} from "@/app/services/api/notification-email-server";

// POST waits for the change notice, so maxDuration must exceed EMAIL_SEND_TIMEOUT_MS (15s).
export const maxDuration = 30;

/**
 * Confirmation page. No address and no token in the visible text. The token stays in the form
 * action, the same way the unsubscribe page keeps its token. GET must not switch the address:
 * mail scanners prefetch links.
 */
function renderPage(status: number, title: string, message: string, formAction?: string): Response {
  const html = [
    "<!DOCTYPE html>",
    '<html lang="ja"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    `<title>${title} | ${EMAIL_SERVICE_NAME}</title></head>`,
    '<body style="margin:0;background:#f4f4f5;font-family:sans-serif;color:#18181b;">',
    '<main style="max-width:480px;margin:48px auto;padding:0 16px;">',
    '<div style="background:#ffffff;border-radius:8px;padding:24px;line-height:1.7;">',
    `<h1 style="font-size:18px;margin:0 0 12px;">${title}</h1>`,
    `<p style="margin:0;font-size:14px;">${message}</p>`,
    ...(formAction
      ? [
          `<form method="post" action="${escapeHtml(formAction)}" style="margin:16px 0 0;">`,
          '<button type="submit" style="padding:10px 20px;background:#2563eb;color:#ffffff;border:0;border-radius:6px;font-size:14px;cursor:pointer;">変更を確定する</button>',
          "</form>",
        ]
      : []),
    "</div>",
    `<p style="font-size:12px;color:#71717a;margin-top:16px;">${EMAIL_SERVICE_NAME}</p>`,
    "</main></body></html>",
  ].join("");

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function invalidPage(): Response {
  return renderPage(
    400,
    "リンクが無効です",
    "確認リンクが正しくないか、すでに使われています。設定画面からもう一度お試しください。"
  );
}

function expiredPage(): Response {
  return renderPage(
    400,
    "リンクの有効期限が切れています",
    "確認リンクの有効期限が切れています。設定画面からもう一度お試しください。"
  );
}

function errorPage(): Response {
  return renderPage(500, "処理できませんでした", "時間をおいて、もう一度お試しください。");
}

function readToken(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get("token");
}

/**
 * Shows the confirm button and does not change the address. Login is not required: the link is
 * opened from the new inbox, often on another device. The token is what identifies the row.
 */
export async function GET(request: NextRequest) {
  const token = readToken(request);
  if (!token) {
    return invalidPage();
  }
  try {
    const state = await previewNotificationEmailLink(token);
    if (state === "ready") {
      return renderPage(
        200,
        "通知の送り先を変更します",
        "このメールを受け取ったアドレスを、通知の送り先に設定します。ボタンを押すまで変更は確定しません。",
        `?token=${encodeURIComponent(token)}`
      );
    }
    if (state === "expired") {
      return expiredPage();
    }
    if (state === "error") {
      return errorPage();
    }
    return invalidPage();
  } catch (error) {
    console.error("通知先確認画面エラー:", error);
    return errorPage();
  }
}

/** Applies the change once. A second POST with the same token does not switch again. */
export async function POST(request: NextRequest) {
  const token = readToken(request);
  if (!token) {
    return invalidPage();
  }
  try {
    const state = await confirmNotificationEmail(token);
    if (state === "confirmed") {
      return renderPage(
        200,
        "通知の送り先を変更しました",
        "以後のメールは、このメールを受け取ったアドレスに届きます。"
      );
    }
    if (state === "expired") {
      return expiredPage();
    }
    if (state === "error") {
      return errorPage();
    }
    return invalidPage();
  } catch (error) {
    console.error("通知先確認APIエラー:", error);
    return errorPage();
  }
}
