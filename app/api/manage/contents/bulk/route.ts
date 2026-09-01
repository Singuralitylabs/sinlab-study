import { NextResponse } from "next/server";
import type { BulkContentAction } from "@/app/constants/content";
import { isBulkContentAction, MAX_BULK_CONTENT_IDS } from "@/app/constants/content";
import { USER_STATUS } from "@/app/constants/user";
import { isContentType } from "@/app/lib/content-filtering";
import { bulkUpdateContents } from "@/app/services/api/admin-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import type { LearningContent } from "@/app/types";

function isValidIds(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_BULK_CONTENT_IDS &&
    value.every((id) => Number.isInteger(id) && id > 0)
  );
}

/** BulkContentAction は BULK_CONTENT_ACTIONS 全件を網羅しており、呼び出し前に isBulkContentAction で検証済みのため到達不能分岐は設けない */
function buildPatch(
  action: BulkContentAction,
  contentType: unknown
): Partial<LearningContent> | { error: string } {
  switch (action) {
    case "publish":
      return { is_published: true };
    case "unpublish":
      return { is_published: false };
    case "open_trial":
      return { is_open_to_trial: true };
    case "close_trial":
      return { is_open_to_trial: false };
    case "delete":
      return { is_deleted: true };
    case "set_type":
      if (typeof contentType !== "string" || !isContentType(contentType)) {
        return { error: "有効なコンテンツ種別を指定してください" };
      }
      return { content_type: contentType };
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, userId, userStatus, userRole } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }
    if (!checkContentPermissions(userRole)) {
      return NextResponse.json({ error: "コンテンツ管理権限がありません" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "不正なリクエストボディです" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "不正なリクエストボディです" }, { status: 400 });
    }
    const { ids, action, contentType } = body as Record<string, unknown>;

    if (!isValidIds(ids)) {
      return NextResponse.json(
        { error: `idsは1〜${MAX_BULK_CONTENT_IDS}件の正の整数で指定してください` },
        { status: 400 }
      );
    }
    if (!isBulkContentAction(action)) {
      return NextResponse.json({ error: "不正なactionです" }, { status: 400 });
    }

    const patch = buildPatch(action, contentType);
    if ("error" in patch) {
      return NextResponse.json({ error: patch.error }, { status: 400 });
    }

    const { error, updated } = await bulkUpdateContents(ids, patch);

    if (error) {
      return NextResponse.json({ error: "コンテンツの一括更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
