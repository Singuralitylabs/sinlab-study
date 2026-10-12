import { NextResponse } from "next/server";
import { BULK_SETTABLE_CONTENT_TYPES, type BulkContentAction } from "@/app/constants/content";
import { isContentType } from "@/app/lib/content-filtering";
import { bulkUpdateContents, createContentsAtTail } from "@/app/services/api/admin-server";
import {
  BulkContentCreateSchema,
  BulkContentUpdateSchema,
  validateRequest,
} from "@/app/services/api/schemas";
import { requireContentManagerApi } from "@/app/services/auth/admin-guard";
import type { LearningContent } from "@/app/types";

// Bulk creation runs up to MAX_BULK_CREATE_CONTENTS items sequentially (several DB round trips
// each). If the platform default timeout cut it off, the response listing what was already
// created would never reach the admin.
export const maxDuration = 60;

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

/**
 * Bulk registration (e.g. a course's quizzes with their questions). Every item is validated
 * before anything is written; creation then runs in order and stops at the first failure.
 */
export async function POST(request: Request) {
  try {
    const { response: denied } = await requireContentManagerApi();
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

    // A quiz whose publish step failed is created as a draft; name them (on success and on a later
    // failure alike) so the admin publishes them instead of re-sending, which would duplicate them.
    const requestedPublished = validation.data.contents.map((c) => c.is_published === true);
    const unpublished = created.filter((c, i) => requestedPublished[i] && !c.isPublished);
    const warning =
      unpublished.length > 0
        ? `公開に失敗したため非公開で作成したコンテンツがあります: ${unpublished
            .map((c) => c.title)
            .join("、")}`
        : undefined;

    if (error) {
      // A missing week_id (FK) or a value the DB CHECK rejects is the caller's input, not a
      // server fault, so report it as 400 to tell it apart from a DB outage.
      const isInputError = error.code === "23503" || error.code === "23514";
      return NextResponse.json(
        {
          error: `${(failedIndex ?? 0) + 1}件目のコンテンツの作成に失敗しました（それより前の${created.length}件は作成済み）${isInputError ? "。存在しない週や許可されていない値が含まれています" : ""}`,
          created,
          ...(warning ? { warning } : {}),
        },
        { status: isInputError ? 400 : 500 }
      );
    }

    return NextResponse.json({ success: true, created, ...(warning ? { warning } : {}) });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { response: denied } = await requireContentManagerApi();
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
