import { NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { isContentType } from "@/app/lib/content-filtering";
import { bulkUpdateContents } from "@/app/services/api/admin-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import type { LearningContent } from "@/app/types";

const BULK_ACTIONS = [
  "publish",
  "unpublish",
  "open_trial",
  "close_trial",
  "set_type",
  "delete",
] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];

function isBulkAction(value: unknown): value is BulkAction {
  return typeof value === "string" && (BULK_ACTIONS as readonly string[]).includes(value);
}

const MAX_BULK_IDS = 100;

function isValidIds(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_BULK_IDS &&
    value.every((id) => Number.isInteger(id) && id > 0)
  );
}

function buildPatch(
  action: BulkAction,
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
    default:
      return { error: "不正なactionです" };
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

    const body = await request.json();
    const { ids, action, contentType } = body;

    if (!isValidIds(ids)) {
      return NextResponse.json(
        { error: `idsは1〜${MAX_BULK_IDS}件の正の整数で指定してください` },
        { status: 400 }
      );
    }
    if (!isBulkAction(action)) {
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
