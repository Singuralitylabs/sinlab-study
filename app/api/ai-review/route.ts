import { type NextRequest, NextResponse } from "next/server";
import { GEMINI_MAX_CODE_LENGTH } from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";
import { evaluateReviewRequest, staleReviewCutoff } from "@/app/lib/ai-review-limits";
import { parseGradingRubric } from "@/app/lib/grading-schema";
import { getSubmissionCodeFiles, withFallbackLanguage } from "@/app/lib/submission-files";
import {
  claimPendingAIReview,
  updateAIReviewCompleted,
  updateAIReviewFailed,
  updateAIReviewProcessing,
} from "@/app/services/api/ai-review-server";
import { fetchAIReviewUsage } from "@/app/services/api/ai-review-usage-server";
import {
  generateReview,
  ReviewGenerationError,
  type ReviewSubmission,
  resolveGeminiApiKey,
} from "@/app/services/api/gemini";
import { isContentVisible } from "@/app/services/api/learning-server";
import { AiReviewRequestSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

// Next.js route segment config is statically analyzed as literals only, so this can't be a
// constant. generateReview() caps all attempts + retry waits at GEMINI_TOTAL_BUDGET_MS
// (app/constants/gemini.ts), so Gemini time never exceeds it; 60s (greater than the budget) leaves
// headroom for DB round trips.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, AiReviewRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { submissionId } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId, userStatus } = guard.auth;

    const apiKey = resolveGeminiApiKey(userStatus);
    if (!apiKey) {
      return NextResponse.json({ error: "AIレビュー機能が設定されていません" }, { status: 503 });
    }

    const supabase = await createServerSupabaseClient();

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("*, content:learning_contents(*)")
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json({ error: "提出データが見つかりません" }, { status: 404 });
    }

    if (submission.user_id !== userId) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // Visibility check: content that became non-trial/unpublished after submission gives 403. Check
    // first because the nested select's content is null under RLS, which would otherwise yield the
    // misleading "exercise not found" error.
    if (!(await isContentVisible(supabase, submission.content_id))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    const content = submission.content;
    if (!content?.exercise_instructions) {
      return NextResponse.json(
        { error: "この提出に関連する演習課題が見つかりません" },
        { status: 400 }
      );
    }

    let reviewSubmission: ReviewSubmission;
    if (submission.submission_type === "code") {
      const files = getSubmissionCodeFiles(submission);
      if (files.length === 0) {
        return NextResponse.json({ error: "提出内容が空です" }, { status: 400 });
      }

      const totalLength = files.reduce((sum, file) => sum + file.content.length, 0);
      if (totalLength > GEMINI_MAX_CODE_LENGTH) {
        return NextResponse.json(
          { error: `コードが長すぎます（上限: ${GEMINI_MAX_CODE_LENGTH}文字）` },
          { status: 400 }
        );
      }

      reviewSubmission = {
        type: "code",
        files: withFallbackLanguage(files, content.code_language),
      };
    } else {
      if (!submission.url) {
        return NextResponse.json({ error: "提出内容が空です" }, { status: 400 });
      }
      reviewSubmission = { type: "url", content: submission.url };
    }

    const usage = await fetchAIReviewUsage(supabase, {
      userId,
      contentId: submission.content_id,
      includeDailyTotal: userStatus === USER_STATUS.ACTIVE,
    });
    if (!usage) {
      return NextResponse.json({ error: "AIレビュー回数の確認に失敗しました" }, { status: 500 });
    }

    const decision = evaluateReviewRequest({
      userStatus,
      submissionId,
      contentReviews: usage.contentReviews,
      todayTotal: usage.todayTotal,
      now: new Date(),
    });

    if (decision.kind === "processing") {
      return NextResponse.json(
        {
          message: "AIレビューは現在生成中です",
          review: { id: decision.reviewId, status: "processing" },
        },
        { status: 202 }
      );
    }
    if (decision.kind === "limited") {
      return NextResponse.json(
        {
          error: decision.message,
          remaining: decision.remaining,
          resetsAt: decision.resetsAt,
        },
        { status: 429 }
      );
    }
    const remainingAfterReview = Math.max(0, decision.remaining - 1);

    const reviewRecord = await claimPendingAIReview(
      submissionId,
      staleReviewCutoff(new Date()).toISOString()
    );
    if (!reviewRecord) {
      return NextResponse.json({ error: "AIレビューの初期化に失敗しました" }, { status: 500 });
    }
    if (reviewRecord === "busy") {
      return NextResponse.json(
        { error: "この提出のAIレビューは別のリクエストで処理中、または実行済みです" },
        { status: 409 }
      );
    }

    const processingResult = await updateAIReviewProcessing(reviewRecord.id);
    if (!processingResult) {
      return NextResponse.json(
        { error: "AIレビューのステータス更新に失敗しました" },
        { status: 500 }
      );
    }

    try {
      const result = await generateReview({
        exerciseInstructions: content.exercise_instructions,
        submission: reviewSubmission,
        referenceAnswer: content.reference_answer,
        gradingRubric: parseGradingRubric(content.grading_rubric),
        apiKey,
      });

      await updateAIReviewCompleted(reviewRecord.id, {
        reviewContent: result.reviewContent,
        overallScore: result.overallScore,
        reviewJson: result.reviewJson,
        scoreKind: result.scoreKind,
        rubricVersion: result.rubricVersion,
        passed: result.passed,
        modelUsed: result.modelUsed,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        thoughtsTokens: result.thoughtsTokens,
      });

      return NextResponse.json({
        success: true,
        review: {
          id: reviewRecord.id,
          status: "completed",
          review_content: result.reviewContent,
          overall_score: result.overallScore,
          review_json: result.reviewJson,
          score_kind: result.scoreKind,
          rubric_version: result.rubricVersion,
          passed: result.passed,
          model_used: result.modelUsed,
        },
        remaining: remainingAfterReview,
      });
    } catch (geminiError) {
      const errorMessage =
        geminiError instanceof Error ? geminiError.message : "AI レビュー生成に失敗しました";
      console.error("Gemini APIエラー:", errorMessage);

      await updateAIReviewFailed(
        reviewRecord.id,
        errorMessage,
        geminiError instanceof ReviewGenerationError ? geminiError.usage : undefined
      );

      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }
  } catch (error) {
    console.error("AIレビューAPIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
