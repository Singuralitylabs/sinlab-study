import { type NextRequest, NextResponse } from "next/server";
import { isContentVisible } from "@/app/services/api/learning-server";
import { gradeQuizAnswers } from "@/app/services/api/quiz-server";
import { QuizGradeRequestSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";
import { checkContentPermissions } from "@/app/services/auth/permissions";

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, QuizGradeRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, answers } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userRole } = guard.auth;

    const supabase = await createServerSupabaseClient();

    // Same visibility check as the submission/progress APIs. admin / maintainer skip it so they can
    // try an unpublished quiz in preview (spec 2.12); grade_quiz_answers() re-checks either way.
    if (!checkContentPermissions(userRole) && !(await isContentVisible(supabase, contentId))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    const { data: results, error } = await gradeQuizAnswers(supabase, contentId, answers);
    if (error) {
      return NextResponse.json({ error: "採点に失敗しました" }, { status: 500 });
    }
    if (results.length === 0) {
      // The form only submits when every question is answered, so an empty result there usually
      // means a question was replaced or removed after the page loaded (revision / id mismatch).
      return NextResponse.json(
        {
          error:
            "すべての設問に回答してください。設問が更新された場合は、ページを再読み込みしてください",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
