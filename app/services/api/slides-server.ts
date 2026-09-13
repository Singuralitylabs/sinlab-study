import type { SupabaseClient } from "@supabase/supabase-js";
import { SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS, SLIDES_BUCKET } from "@/app/constants/storage";
import { toSlideObjectKey } from "@/app/lib/slide-object-key";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * スライドPDFの署名付きURLを発行する（issue #89）。
 *
 * 【不変条件】この関数はコンテンツの閲覧権限チェックの後にのみ呼ぶこと。
 * 学習画面では `isContentLockedForUser()` でロック判定し、`fetchContentById()`（RLS適用）で
 * コンテンツ行を取得できた後に呼ぶ。ロック済み・未公開のコンテンツではURL自体を発行しない。
 *
 * 発行に失敗した場合（Storage障害・ポリシーで不可視・キーとして解釈できない値）は
 * null を返し、呼び出し側はビューアの代わりにエラーメッセージを表示する。
 */
export async function createSlideSignedUrlWithClient(
  supabase: Pick<SupabaseClient, "storage">,
  pdfUrl: string
): Promise<string | null> {
  const objectKey = toSlideObjectKey(pdfUrl);
  if (!objectKey) {
    console.error("スライドのオブジェクトキーとして解釈できません:", pdfUrl);
    return null;
  }

  const { data, error } = await supabase.storage
    .from(SLIDES_BUCKET)
    .createSignedUrl(objectKey, SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("スライド署名付きURLの発行エラー:", error?.message ?? "signedUrl が空です");
    return null;
  }

  return data.signedUrl;
}

/**
 * ログイン中のユーザー権限（通常クライアント・RLS適用）でスライドの署名付きURLを発行する。
 *
 * `storage.objects` の SELECT ポリシーは `learning_contents` の RLS に委譲されている
 * （`pdf_url = storage.objects.name` を満たす可視コンテンツが存在する場合のみ許可）ため、
 * お試しユーザーがロック済みコンテンツのキーを推測しても、この経路でも Storage API 直叩きでも
 * 署名は発行されない。service_role は使わない。
 */
export async function createSlideSignedUrl(pdfUrl: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  return createSlideSignedUrlWithClient(supabase, pdfUrl);
}
