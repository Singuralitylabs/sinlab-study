import { type NextRequest, NextResponse } from "next/server";
import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
import { deleteContent, updateContent } from "@/app/services/api/admin-server";
import { ContentUpdateSchema, validateRequest } from "@/app/services/api/schemas";
import { requireContentManagerApi } from "@/app/services/auth/admin-guard";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { response: denied } = await requireContentManagerApi();
    if (denied) {
      return denied;
    }

    const { id } = await params;
    const contentId = Number.parseInt(id, 10);
    if (Number.isNaN(contentId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const validation = await validateRequest(request, ContentUpdateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const {
      title,
      week_id,
      content_type,
      video_url,
      text_content,
      description,
      exercise_instructions,
      hint,
      reference_answer,
      starter_files,
      allowed_submission_types,
      code_language,
      pdf_url,
      grading_rubric,
      grading_rubric_version,
      insert_after_id,
      is_published,
      is_open_to_trial,
      quiz_questions,
    } = validation.data;

    const { error, storageRemoved, conflict, keyReuse, gradingRubricVersion } = await updateContent(
      contentId,
      {
        title,
        week_id,
        content_type,
        video_url,
        text_content,
        description,
        exercise_instructions,
        hint,
        reference_answer,
        starter_files,
        allowed_submission_types,
        code_language,
        pdf_url,
        gradingRubric: grading_rubric,
        loadedRubricVersion: grading_rubric_version,
        insertAfterId: insert_after_id,
        is_published,
        is_open_to_trial,
        quizQuestions: quiz_questions,
      }
    );

    if (keyReuse) {
      return NextResponse.json(
        {
          error: `要件キー（${keyReuse.join(", ")}）は過去のレビューで使った番号なので再利用できません`,
        },
        { status: 400 }
      );
    }
    if (conflict) {
      return NextResponse.json(
        { error: "採点基準が別の保存で更新されています。画面を読み込み直してください" },
        { status: 409 }
      );
    }
    if (error) {
      return NextResponse.json({ error: "コンテンツの更新に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      storageRemoved,
      // Only after a rubric write. The form adopts this instead of a refreshed prop, whose rows
      // it has not loaded.
      ...(gradingRubricVersion !== undefined
        ? { grading_rubric_version: gradingRubricVersion }
        : {}),
    });
  } catch (error) {
    if (error instanceof InvalidInsertAfterIdError) {
      console.error("コンテンツ更新エラー（insert_after_id不正）:", error.insertAfterId);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { response: denied } = await requireContentManagerApi();
    if (denied) {
      return denied;
    }
    const { id } = await params;
    const contentId = Number.parseInt(id, 10);
    if (Number.isNaN(contentId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }
    const { error, storageRemoved } = await deleteContent(contentId);
    if (error) {
      return NextResponse.json({ error: "コンテンツの削除に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ success: true, storageRemoved });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
