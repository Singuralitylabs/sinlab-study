import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

const BUCKET_NAME = "thumbnails";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

// "hero" is the optional wide image for the phase list header (falls back to a crop of the
// thumbnail). Both live in the same bucket under fixed per-theme keys.
const IMAGE_KINDS = ["thumbnail", "hero"] as const;
type ImageKind = (typeof IMAGE_KINDS)[number];

const IMAGE_KIND_CONFIG = {
  thumbnail: {
    column: "image_url",
    pathPattern:
      /^\/storage\/v1\/object\/public\/thumbnails\/(theme-\d+\/thumbnail\.(?:jpg|png|webp))(?:\?.*)?$/,
  },
  hero: {
    column: "hero_image_url",
    pathPattern:
      /^\/storage\/v1\/object\/public\/thumbnails\/(theme-\d+\/hero\.(?:jpg|png|webp))(?:\?.*)?$/,
  },
} as const;

// Absent means thumbnail so callers predating "hero" keep working; an unknown value is rejected.
function parseImageKind(value: FormDataEntryValue | string | null): ImageKind | null {
  if (value === null || value === "") return "thumbnail";
  return IMAGE_KINDS.find((kind) => kind === value) ?? null;
}

function getImagePath(imageUrl: string | null, themeId: number, kind: ImageKind): string | null {
  if (!imageUrl) return null;

  const match = imageUrl.match(IMAGE_KIND_CONFIG[kind].pathPattern);
  return match?.[1].startsWith(`theme-${themeId}/`) ? match[1] : null;
}

function imageColumnPatch(kind: ImageKind, value: string | null) {
  return kind === "hero" ? { hero_image_url: value } : { image_url: value };
}

function currentImageUrl(
  theme: { image_url: string | null; hero_image_url?: string | null },
  kind: ImageKind
): string | null {
  return (kind === "hero" ? theme.hero_image_url : theme.image_url) ?? null;
}

async function getTheme(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  themeId: number
) {
  return supabase
    .from("learning_themes")
    .select("image_url, hero_image_url")
    .eq("id", themeId)
    .eq("is_deleted", false)
    .maybeSingle();
}

async function authenticateContentManager() {
  const { user, userId, userRole, userStatus } = await getServerAuth();
  if (!user) return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  if (!userId || userStatus === USER_STATUS.REJECTED) {
    return { error: NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 }) };
  }
  if (!checkContentPermissions(userRole)) {
    return { error: NextResponse.json({ error: "アップロード権限がありません" }, { status: 403 }) };
  }
  return { error: null };
}

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await authenticateContentManager();
    if (authError) return authError;

    const formData = await request.formData();
    const file = formData.get("file");
    const themeId = parsePositiveInteger(formData.get("themeId"));
    const kind = parseImageKind(formData.get("kind"));

    if (!kind) {
      return NextResponse.json({ error: "画像の種類が不正です" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "画像ファイルを選択してください" }, { status: 400 });
    }
    if (!themeId) {
      return NextResponse.json({ error: "テーマIDが不正です" }, { status: 400 });
    }

    const extension = ALLOWED_CONTENT_TYPES[file.type as keyof typeof ALLOWED_CONTENT_TYPES];
    if (!extension) {
      return NextResponse.json(
        { error: "PNG、JPEG、WebP形式の画像のみアップロード可能です" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "ファイルサイズは5MB以下にしてください" }, { status: 400 });
    }

    const path = `theme-${themeId}/${kind === "hero" ? "hero" : "thumbnail"}.${extension}`;
    const supabase = await createAdminSupabaseClient();
    const { data: theme, error: themeError } = await getTheme(supabase, themeId);
    if (themeError) {
      console.error("テーマ取得エラー:", themeError);
      return NextResponse.json({ error: "テーマの確認に失敗しました" }, { status: 500 });
    }
    if (!theme) {
      return NextResponse.json({ error: "テーマが見つかりません" }, { status: 404 });
    }

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error("サムネイルアップロードエラー:", error);
      return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
    }

    const version = Date.now();
    const relativeUrl = `/storage/v1/object/public/${BUCKET_NAME}/${path}?v=${version}`;
    const { error: updateError } = await supabase
      .from("learning_themes")
      .update(imageColumnPatch(kind, relativeUrl))
      .eq("id", themeId)
      .eq("is_deleted", false);
    if (updateError) {
      if (getImagePath(currentImageUrl(theme, kind), themeId, kind) !== path) {
        await supabase.storage.from(BUCKET_NAME).remove([path]);
      }
      console.error("テーマ更新エラー:", updateError);
      return NextResponse.json({ error: "テーマへの画像保存に失敗しました" }, { status: 500 });
    }

    const previousPath = getImagePath(currentImageUrl(theme, kind), themeId, kind);
    if (previousPath && previousPath !== path) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([previousPath]);
      if (removeError) console.error("旧サムネイル削除エラー:", removeError);
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    return NextResponse.json({ path: relativeUrl, url: `${data.publicUrl}?v=${version}` });
  } catch (error) {
    console.error("サムネイルアップロードAPIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error: authError } = await authenticateContentManager();
    if (authError) return authError;

    const themeId = parsePositiveInteger(request.nextUrl.searchParams.get("themeId"));
    const kind = parseImageKind(request.nextUrl.searchParams.get("kind"));
    if (!kind) {
      return NextResponse.json({ error: "画像の種類が不正です" }, { status: 400 });
    }
    if (!themeId) {
      return NextResponse.json({ error: "テーマIDが不正です" }, { status: 400 });
    }

    const supabase = await createAdminSupabaseClient();
    const { data: theme, error: themeError } = await getTheme(supabase, themeId);
    if (themeError) {
      console.error("テーマ取得エラー:", themeError);
      return NextResponse.json({ error: "テーマの確認に失敗しました" }, { status: 500 });
    }
    if (!theme) {
      return NextResponse.json({ error: "テーマが見つかりません" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("learning_themes")
      .update(imageColumnPatch(kind, null))
      .eq("id", themeId)
      .eq("is_deleted", false);
    if (updateError) {
      console.error("テーマ更新エラー:", updateError);
      return NextResponse.json({ error: "テーマから画像を削除できませんでした" }, { status: 500 });
    }

    // The DB reference is already removed, so a deletion failure doesn't return 500 (retrying can't
    // identify the target since image_url is already NULL). Return the result so callers can detect
    // a partial failure.
    const previousPath = getImagePath(currentImageUrl(theme, kind), themeId, kind);
    let storageRemoved = true;
    if (previousPath) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([previousPath]);
      if (removeError) {
        console.error("サムネイル削除エラー:", removeError);
        storageRemoved = false;
      }
    }
    return NextResponse.json({ success: true, storageRemoved });
  } catch (error) {
    console.error("サムネイル削除APIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
