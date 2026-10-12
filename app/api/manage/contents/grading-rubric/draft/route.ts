import { type NextRequest, NextResponse } from "next/server";
import { GEMINI_API_KEY_ENV } from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";
import { generateGradingRubricDraft } from "@/app/services/api/gemini";
import { GradingRubricDraftRequestSchema, validateRequest } from "@/app/services/api/schemas";
import { checkContentPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";

// See app/api/ai-review/route.ts: the route segment config must be a literal. The Gemini call is
// bounded by GEMINI_TOTAL_BUDGET_MS, which is below this.
export const maxDuration = 60;

/** Returns an AI draft of a grading rubric. Nothing is saved; an instructor reviews and saves. */
export async function POST(request: NextRequest) {
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

    const validation = await validateRequest(request, GradingRubricDraftRequestSchema);
    if (!validation.success) {
      return validation.response;
    }

    // Drafting is an instructor action, so it always uses the member key (not the trial key).
    const apiKey = process.env[GEMINI_API_KEY_ENV];
    if (!apiKey) {
      return NextResponse.json({ error: "AIレビュー機能が設定されていません" }, { status: 503 });
    }

    try {
      const requirements = await generateGradingRubricDraft({
        exerciseInstructions: validation.data.exercise_instructions,
        referenceAnswer: validation.data.reference_answer,
        apiKey,
      });
      return NextResponse.json({ requirements });
    } catch (geminiError) {
      const message =
        geminiError instanceof Error ? geminiError.message : "採点基準の下書き生成に失敗しました";
      console.error("採点基準の下書き生成エラー:", message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    console.error("API エラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
