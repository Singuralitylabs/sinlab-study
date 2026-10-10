import { type NextRequest, NextResponse } from "next/server";
import { GEMINI_MAX_CODE_LENGTH } from "@/app/constants/gemini";
import { USER_STATUS } from "@/app/constants/user";
import { getSubmissionCodeFiles } from "@/app/lib/submission-files";
import {
  updateAIReviewCompleted,
  updateAIReviewFailed,
  updateAIReviewProcessing,
  upsertPendingAIReview,
} from "@/app/services/api/ai-review-server";
import {
  generateReview,
  type ReviewSubmission,
  resolveGeminiApiKey,
} from "@/app/services/api/gemini";
import { isContentVisible } from "@/app/services/api/learning-server";
import { AiReviewRequestSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

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

    const { user, userId, userStatus } = await getServerAuth();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: "ユーザー情報が見つかりません" }, { status: 403 });
    }
    if (userStatus === USER_STATUS.REJECTED) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

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

      // A single-file submission is stored in code_content, which has no language; fall back to
      // the exercise's language so the model knows how to read e.g. SQL or Bash.
      const reviewFiles =
        files.length === 1 && !files[0].language && content.code_language
          ? [{ ...files[0], language: content.code_language }]
          : files;
      reviewSubmission = { type: "code", files: reviewFiles };
    } else {
      if (!submission.url) {
        return NextResponse.json({ error: "提出内容が空です" }, { status: 400 });
      }
      reviewSubmission = { type: "url", content: submission.url };
    }

    // One AI review per user and content.
    const contentId = submission.content_id;
    const { data: userSubmissionsForContent } = await supabase
      .from("submissions")
      .select("id")
      .eq("user_id", userId)
      .eq("content_id", contentId);

    const allSubmissionIdsForContent = (userSubmissionsForContent ?? []).map((s) => s.id);

    if (allSubmissionIdsForContent.length > 0) {
      const { data: activeReview } = await supabase
        .from("ai_reviews")
        .select("id, status, submission_id")
        .in("submission_id", allSubmissionIdsForContent)
        .in("status", ["completed", "processing", "pending"])
        .limit(1)
        .maybeSingle();

      if (activeReview) {
        if (activeReview.status === "processing" && activeReview.submission_id === submissionId) {
          return NextResponse.json(
            {
              message: "AIレビューは現在生成中です",
              review: { id: activeReview.id, status: "processing" },
            },
            { status: 202 }
          );
        }
        return NextResponse.json(
          { error: "この課題のAIレビューは1回のみ利用できます" },
          { status: 429 }
        );
      }
    }

    const reviewRecord = await upsertPendingAIReview(submissionId);
    if (!reviewRecord) {
      return NextResponse.json({ error: "AIレビューの初期化に失敗しました" }, { status: 500 });
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
        apiKey,
      });

      await updateAIReviewCompleted(reviewRecord.id, {
        reviewContent: result.reviewContent,
        overallScore: result.overallScore,
        modelUsed: result.modelUsed,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      });

      return NextResponse.json({
        success: true,
        review: {
          id: reviewRecord.id,
          status: "completed",
          review_content: result.reviewContent,
          overall_score: result.overallScore,
          model_used: result.modelUsed,
        },
      });
    } catch (geminiError) {
      const errorMessage =
        geminiError instanceof Error ? geminiError.message : "AI レビュー生成に失敗しました";
      console.error("Gemini APIエラー:", errorMessage);

      await updateAIReviewFailed(reviewRecord.id, errorMessage);

      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }
  } catch (error) {
    console.error("AIレビューAPIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
