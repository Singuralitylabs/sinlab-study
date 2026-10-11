import type { SupabaseClient } from "@supabase/supabase-js";
import { SLIDE_SIGNED_URL_EXPIRES_IN_SECONDS, SLIDES_BUCKET } from "@/app/constants/storage";
import { toSlideObjectKey } from "@/app/lib/slide-object-key";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * Issues a signed URL for a slide PDF (issue #89).
 * Invariant: call only AFTER the content view-permission check. The learning page decides the
 * lock with isContentLockedForUser() and calls this after fetchContentById() (RLS applied)
 * returned the row. Locked or unpublished contents get no URL.
 * On failure (Storage error, invisible by policy, value not interpretable as a key) returns null
 * and the caller shows an error instead of the viewer.
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
 * Signs with the logged-in user's client (normal client, RLS applied), never service_role.
 * The `storage.objects` SELECT policy allows member / trial users only when a `learning_contents`
 * row with `pdf_url = storage.objects.name` is visible under the caller's RLS and all four levels
 * including week / phase / theme are published and not deleted (same four-level rule as
 * isContentVisible(); #216). admin / maintainer are allowed unconditionally by role for preview
 * (spec 2.12; isContentVisible() itself is role-independent and fail-closed). A trial user
 * guessing the key of a locked content gets no signature, via this path or the Storage API
 * directly.
 */
export async function createSlideSignedUrl(pdfUrl: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  return createSlideSignedUrlWithClient(supabase, pdfUrl);
}
