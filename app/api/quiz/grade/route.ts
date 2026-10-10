import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { isContentVisible } from "@/app/services/api/learning-server";
import { gradeQuizAnswers } from "@/app/services/api/quiz-server";
import { QuizGradeRequestSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, QuizGradeRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, answers } = validation.data;

    const { user, userId, userStatus, userRole } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (userId == null) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

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
      return NextResponse.json({ error: "すべての設問に回答してください" }, { status: 400 });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
