import type { NextRequest } from "next/server";
import { EMAIL_SERVICE_NAME } from "@/app/constants/notifications";
import { escapeHtml } from "@/app/lib/escape-html";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { verifyUnsubscribeToken } from "@/app/services/notifications/email-unsubscribe";

/**
 * 画面の HTML。ユーザー情報は埋め込まない。`formAction` を渡すと、配信停止を確定する
 * POST フォーム（ボタン）を付ける（トークンは検証済みの値だけを URL に載せる）。
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
          '<button type="submit" style="padding:10px 20px;background:#2563eb;color:#ffffff;border:0;border-radius:6px;font-size:14px;cursor:pointer;">配信を停止する</button>',
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

function invalidLinkPage(): Response {
  return renderPage(
    400,
    "リンクが無効です",
    "配信停止のリンクが正しくありません。メールに記載されたリンクをもう一度お試しください。"
  );
}

function readToken(request: NextRequest): { token: string; userId: number } | null {
  const token = request.nextUrl.searchParams.get("token");
  const userId = verifyUnsubscribeToken(token);
  return token !== null && userId !== null ? { token, userId } : null;
}

/**
 * 配信停止の確認画面（ログイン不要）。GET では停止を確定しない。メールのセキュリティ製品
 * （Outlook の Safe Links 等）はリンクを事前に GET するため、GET で確定すると本人が開く前に
 * 停止されてしまう。確定は画面のボタン（POST）か、メールクライアントのワンクリック配信停止
 * （RFC 8058 の POST）で行う。トークン不正・シークレット未設定は理由を明かさず 400。
 */
export async function GET(request: NextRequest) {
  const verified = readToken(request);
  if (!verified) {
    return invalidLinkPage();
  }
  return renderPage(
    200,
    "案内メールの配信停止",
    "学習状況のお知らせなどの案内メールの配信を停止します。登録・お支払いなどのお手続きに関するメールは引き続きお送りします。",
    `?token=${encodeURIComponent(verified.token)}`
  );
}

/**
 * 配信停止の確定（確認画面のボタンと、`List-Unsubscribe-Post` に対応するメールクライアントの
 * ワンクリック配信停止）。トークンは `users.id` の HMAC 署名で、検証に成功したら
 * `users.email_opt_out_at` を記録する（既に停止済みなら更新せず成功扱い）。
 * トークン不正・シークレット未設定は理由を明かさず 400（フェイルクローズ）。
 * トランザクションメールはこのカラムを見ないため影響しない。
 */
export async function POST(request: NextRequest) {
  const verified = readToken(request);
  if (!verified) {
    return invalidLinkPage();
  }

  try {
    const supabase = await createAdminSupabaseClient();
    const { error } = await supabase
      .from("users")
      .update({ email_opt_out_at: new Date().toISOString() })
      .eq("id", verified.userId)
      .is("email_opt_out_at", null);

    if (error) {
      console.error("[メール配信停止] 更新エラー:", error.message);
      return renderPage(500, "処理できませんでした", "時間をおいて、もう一度お試しください。");
    }
  } catch (error) {
    console.error("[メール配信停止] 予期しないエラー:", error);
    return renderPage(500, "処理できませんでした", "時間をおいて、もう一度お試しください。");
  }

  return renderPage(
    200,
    "配信を停止しました",
    "学習状況のお知らせなどの案内メールの配信を停止しました。登録・お支払いなどのお手続きに関するメールは引き続きお送りします。"
  );
}
