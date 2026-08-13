import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
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

function getThemeId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const themeId = Number(value);
  return Number.isSafeInteger(themeId) && themeId > 0 ? themeId : null;
}

export async function POST(request: NextRequest) {
  try {
    const { user, userId, userRole, userStatus } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!userId || userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    if (!checkContentPermissions(userRole)) {
      return NextResponse.json({ error: "アップロード権限がありません" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const themeId = getThemeId(formData.get("themeId"));

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

    const path = `theme-${themeId}/thumbnail.${extension}`;
    const supabase = await createAdminSupabaseClient();
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
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    return NextResponse.json({ path: relativeUrl, url: `${data.publicUrl}?v=${version}` });
  } catch (error) {
    console.error("サムネイルアップロードAPIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
