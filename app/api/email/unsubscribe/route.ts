import type { NextRequest } from "next/server";
import { EMAIL_SERVICE_NAME } from "@/app/constants/notifications";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { verifyUnsubscribeToken } from "@/app/services/notifications/email-unsubscribe";

/** 確認画面の HTML（動的な値は埋め込まない。トークン・ユーザー情報を画面へ出さない） */
function renderPage(status: number, title: string, message: string): Response {
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

/**
 * 案内系メールの配信停止（ログイン不要）。トークンは `users.id` の HMAC 署名で、検証に
 * 成功したら `users.email_opt_out_at` を記録する（既に停止済みなら更新せず成功扱い）。
 * トークン不正・シークレット未設定は理由を明かさず 400（フェイルクローズ）。
 * トランザクションメールはこのカラムを見ないため影響しない。
 */
async function unsubscribe(request: NextRequest): Promise<Response> {
  const userId = verifyUnsubscribeToken(request.nextUrl.searchParams.get("token"));
  if (userId === null) {
    return renderPage(
      400,
      "リンクが無効です",
      "配信停止のリンクが正しくありません。メールに記載されたリンクをもう一度お試しください。"
    );
  }

  try {
    const supabase = await createAdminSupabaseClient();
    const { error } = await supabase
      .from("users")
      .update({ email_opt_out_at: new Date().toISOString() })
      .eq("id", userId)
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

export async function GET(request: NextRequest) {
  return unsubscribe(request);
}

/**
 * メールクライアントのワンクリック配信停止（RFC 8058。`List-Unsubscribe-Post` ヘッダーに
 * 対応するクライアントは同じ URL へ POST する）。処理は GET と同じ。
 */
export async function POST(request: NextRequest) {
  return unsubscribe(request);
}
