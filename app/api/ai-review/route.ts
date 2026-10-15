import { type NextRequest, NextResponse } from "next/server";
import { GEMINI_MAX_CODE_LENGTH } from "@/app/constants/gemini";
import { limitedDecision } from "@/app/lib/ai-review-limits";
import {
  isCodeEquivalentToStarter,
  parseStarterFiles,
  resolveLanguage,
} from "@/app/lib/code-file-inputs";
import { parseGradingRubric } from "@/app/lib/grading-schema";
import { getSubmissionCodeFiles, withFallbackLanguage } from "@/app/lib/submission-files";
import {
  claimAIReview,
  updateAIReviewCompleted,
  updateAIReviewFailed,
  updateAIReviewProcessing,
} from "@/app/services/api/ai-review-server";
import {
  generateReview,
  ReviewGenerationError,
  type ReviewSubmission,
  resolveGeminiApiKey,
} from "@/app/services/api/gemini";
import { isContentVisible } from "@/app/services/api/learning-server";
import { AiReviewRequestSchema, validateRequest } from "@/app/services/api/schemas";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";
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
      .select(
        "*, content:learning_contents(id, exercise_instructions, code_language, starter_files)"
      )
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

      // Same guard as POST /api/submissions: reject before claim so an unedited starter cannot
      // consume an AI review slot (client-side check alone is bypassable).
      const starterFiles = parseStarterFiles(content.starter_files);
      if (starterFiles) {
        const contentLanguage = resolveLanguage(
          content.code_language ?? "javascript",
          "javascript"
        );
        if (isCodeEquivalentToStarter(files, starterFiles, contentLanguage)) {
          return NextResponse.json(
            { error: "初期コードから変更してください" },
            { status: 400 }
          );
        }
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

    // One transaction checks the count limits and takes the review slot, so concurrent requests
    // cannot all pass on the same counts (#343).
    const now = new Date();
    const claim = await claimAIReview({
      userId,
      submissionId,
      contentId: submission.content_id,
      userStatus,
      now,
    });
    if (!claim) {
      return NextResponse.json({ error: "AIレビュー回数の確認に失敗しました" }, { status: 500 });
    }

    if (claim.kind === "processing") {
      return NextResponse.json(
        {
          message: "AIレビューは現在生成中です",
          review: { id: claim.reviewId, status: "processing" },
        },
        { status: 202 }
      );
    }
    if (claim.kind === "limited") {
      const decision = limitedDecision(claim.reason, claim.remaining, now);
      return NextResponse.json(
        {
          error: decision.message,
          reason: decision.reason,
          remaining: decision.remaining,
          resetsAt: decision.resetsAt,
        },
        { status: 429 }
      );
    }
    if (claim.kind === "busy") {
      return NextResponse.json(
        { error: "この提出のAIレビューは別のリクエストで処理中、または実行済みです" },
        { status: 409 }
      );
    }
    const reviewRecord = { id: claim.reviewId };
    const remainingAfterReview = claim.remaining;

    const processingResult = await updateAIReviewProcessing(reviewRecord.id);
    if (!processingResult) {
      // The claim already made the row `pending`; without this a retry would get a 202 until stale.
      await updateAIReviewFailed(reviewRecord.id, "AIレビューのステータス更新に失敗しました");
      return NextResponse.json(
        { error: "AIレビューのステータス更新に失敗しました" },
        { status: 500 }
      );
    }

    // Learners cannot select grading_rubric or reference_answer. Read them with service_role
    // after the claim so a failed lookup can mark the row failed instead of leaving it
    // processing. Published and not deleted, or a reordered visibility check would grade a
    // hidden rubric.
    const admin = await createAdminSupabaseClient();
    const { data: rubricRow, error: rubricError } = await admin
      .from("learning_contents")
      .select("grading_rubric, reference_answer")
      .eq("id", content.id)
      .eq("is_published", true)
      .eq("is_deleted", false)
      .maybeSingle();
    if (rubricError || !rubricRow) {
      console.error("採点基準の取得エラー:", rubricError?.message ?? "no row");
      await updateAIReviewFailed(reviewRecord.id, "採点基準の取得に失敗しました");
      return NextResponse.json({ error: "採点基準の取得に失敗しました" }, { status: 500 });
    }

    try {
      const result = await generateReview({
        exerciseInstructions: content.exercise_instructions,
        submission: reviewSubmission,
        referenceAnswer: rubricRow.reference_answer,
        gradingRubric: parseGradingRubric(rubricRow.grading_rubric),
        // starter_files is learner-visible (column grant); do not read it via service_role.
        starterFiles: parseStarterFiles(content.starter_files),
        apiKey,
      });

      const saved = await updateAIReviewCompleted(reviewRecord.id, {
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

      if (!saved) {
        // Best effort: a row left `processing` would block a retry with a misleading 202 for
        // AI_REVIEW_STALE_AFTER_MS and the already-billed tokens would go unrecorded.
        await updateAIReviewFailed(reviewRecord.id, "AIレビューの保存に失敗しました", {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          thoughtsTokens: result.thoughtsTokens,
        });
        return NextResponse.json({ error: "AIレビューの保存に失敗しました" }, { status: 500 });
      }

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
      // gemini.ts already logged the raw cause; this records what the learner was shown.
      console.error("AIレビューの生成に失敗:", errorMessage);

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
