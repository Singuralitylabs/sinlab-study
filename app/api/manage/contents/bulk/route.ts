import { NextResponse } from "next/server";
import { BULK_SETTABLE_CONTENT_TYPES, type BulkContentAction } from "@/app/constants/content";
import { USER_STATUS } from "@/app/constants/user";
import { isContentType } from "@/app/lib/content-filtering";
import { bulkUpdateContents, createContentsAtTail } from "@/app/services/api/admin-server";
import {
  BulkContentCreateSchema,
  BulkContentUpdateSchema,
  validateRequest,
} from "@/app/services/api/schemas";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import type { LearningContent } from "@/app/types";

/**
 * BulkContentAction covers all of BULK_CONTENT_ACTIONS and is schema-validated before this call, so
 * no unreachable branch is provided.
 */
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
      // Setting quiz here would publish a quiz with no questions (POST/PUT require them).
      if (!BULK_SETTABLE_CONTENT_TYPES.includes(contentType)) {
        return { error: "クイズへの変更は編集画面で設問と一緒に行ってください" };
      }
      return { content_type: contentType };
  }
}

async function authorizeContentManager(): Promise<NextResponse | null> {
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
  return null;
}

/**
 * Bulk registration (e.g. a course's quizzes with their questions). Every item is validated
 * before anything is written; creation then runs in order and stops at the first failure.
 */
export async function POST(request: Request) {
  try {
    const denied = await authorizeContentManager();
    if (denied) {
      return denied;
    }

    const validation = await validateRequest(request, BulkContentCreateSchema);
    if (!validation.success) {
      return validation.response;
    }

    const { created, error, failedIndex } = await createContentsAtTail(
      validation.data.contents.map(({ quiz_questions, ...content }) => ({
        ...content,
        quizQuestions: quiz_questions,
      }))
    );

    if (error) {
      return NextResponse.json(
        {
          error: `${(failedIndex ?? 0) + 1}件目のコンテンツの作成に失敗しました（それより前の${created.length}件は作成済み）`,
          created,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, created });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await authorizeContentManager();
    if (denied) {
      return denied;
    }

    const validation = await validateRequest(request, BulkContentUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { ids, action, contentType } = validation.data;

    const patch = buildPatch(action, contentType);
    if ("error" in patch) {
      return NextResponse.json({ error: patch.error }, { status: 400 });
    }

    const { error, updated, storageRemoved } = await bulkUpdateContents(ids, patch);

    if (error) {
      return NextResponse.json({ error: "コンテンツの一括更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated, storageRemoved });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
