import { type NextRequest, NextResponse } from "next/server";
import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
import { createContent } from "@/app/services/api/admin-server";
import { ContentCreateSchema, validateRequest } from "@/app/services/api/schemas";
import { requireContentManagerApi } from "@/app/services/auth/admin-guard";

export async function POST(request: NextRequest) {
  try {
    const { response: denied } = await requireContentManagerApi();
    if (denied) {
      return denied;
    }

    const validation = await validateRequest(request, ContentCreateSchema);
    if (!validation.success) {
      return validation.response;
    }
    const {
      title,
      phase_id,
      content_type,
      video_url,
      text_content,
      description,
      exercise_instructions,
      hint,
      reference_answer,
      starter_files,
      submission_file_slots,
      preview_base_html,
      show_preview,
      show_console,
      allowed_submission_types,
      code_language,
      pdf_url,
      grading_rubric,
      insert_after_id,
      is_published,
      is_open_to_trial,
      quiz_questions,
    } = validation.data;

    const { data, error, publishFailed, previewNotAllowed } = await createContent({
      title,
      phase_id,
      content_type,
      video_url,
      text_content,
      description,
      exercise_instructions,
      hint,
      reference_answer,
      starter_files,
      submission_file_slots,
      preview_base_html,
      show_preview,
      show_console,
      allowed_submission_types,
      code_language,
      pdf_url,
      gradingRubric: grading_rubric,
      insertAfterId: insert_after_id,
      is_published,
      is_open_to_trial,
      quizQuestions: quiz_questions,
    });

    if (previewNotAllowed) {
      return NextResponse.json({ error: previewNotAllowed }, { status: 400 });
    }
    if (error) {
      return NextResponse.json({ error: "コンテンツの作成に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      content: data,
      ...(publishFailed
        ? {
            warning:
              "コンテンツは作成しましたが、公開に失敗したため非公開のままです。編集画面から公開してください",
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof InvalidInsertAfterIdError) {
      console.error("コンテンツ作成エラー（insert_after_id不正）:", error.insertAfterId);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
