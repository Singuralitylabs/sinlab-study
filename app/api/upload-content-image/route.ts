import { type NextRequest, NextResponse } from "next/server";
import {
  CONTENT_IMAGE_ALLOWED_TYPES,
  CONTENT_IMAGE_MAX_BYTES,
  CONTENT_IMAGES_BUCKET,
  type ContentImageMimeType,
} from "@/app/constants/storage";
import { USER_STATUS } from "@/app/constants/user";
import {
  buildContentImageMarkdownRef,
  buildContentImageObjectKey,
} from "@/app/lib/content-image-key";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

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
    const contentId = parsePositiveInteger(formData.get("contentId"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "画像ファイルを選択してください" }, { status: 400 });
    }
    // New content has no id yet; require an existing row so keys stay under content-{id}/.
    if (!contentId) {
      return NextResponse.json(
        { error: "コンテンツ保存後に画像をアップロードしてください" },
        { status: 400 }
      );
    }

    const extension = CONTENT_IMAGE_ALLOWED_TYPES[file.type as ContentImageMimeType];
    if (!extension) {
      return NextResponse.json(
        { error: "PNG、JPEG、WebP、GIF形式の画像のみアップロード可能です" },
        { status: 400 }
      );
    }
    if (file.size > CONTENT_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "ファイルサイズは5MB以下にしてください" }, { status: 400 });
    }

    const supabase = await createAdminSupabaseClient();
    const { data: content, error: contentError } = await supabase
      .from("learning_contents")
      .select("id")
      .eq("id", contentId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (contentError) {
      console.error("コンテンツ取得エラー:", contentError);
      return NextResponse.json({ error: "コンテンツの確認に失敗しました" }, { status: 500 });
    }
    if (!content) {
      return NextResponse.json({ error: "コンテンツが見つかりません" }, { status: 404 });
    }

    const objectKey = buildContentImageObjectKey({
      contentId,
      extension,
      randomId: crypto.randomUUID(),
    });

    const { error: uploadError } = await supabase.storage
      .from(CONTENT_IMAGES_BUCKET)
      .upload(objectKey, new Uint8Array(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("コンテンツ画像アップロードエラー:", uploadError);
      return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
    }

    const markdownRef = buildContentImageMarkdownRef(objectKey);
    return NextResponse.json({ path: markdownRef, objectKey });
  } catch (error) {
    console.error("コンテンツ画像アップロードAPIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
