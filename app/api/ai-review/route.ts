import { type NextRequest, NextResponse } from "next/server";
import { USER_STATUS } from "@/app/constants/user";
import { getSubmissionCodeFiles } from "@/app/lib/submission-files";
import {
  updateAIReviewCompleted,
  updateAIReviewFailed,
  updateAIReviewProcessing,
  upsertPendingAIReview,
} from "@/app/services/api/ai-review-server";
import { generateReview, type ReviewSubmission } from "@/app/services/api/gemini";
import { isContentVisible } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const MAX_CODE_LENGTH = 8000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { submissionId } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "submissionId は必須です" }, { status: 400 });
    }

    // 認証チェック
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

    const supabase = await createServerSupabaseClient();

    // 提出データ + コンテンツ取得
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("*, content:learning_contents(*)")
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json({ error: "提出データが見つかりません" }, { status: 404 });
    }

    // 本人の提出か検証
    if (submission.user_id !== userId) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    // コンテンツ可視性チェック: 提出後にお試し非公開化・非公開化されたコンテンツは403
    // （nested select の content は RLS により null になるため、先に判定して
    // 「演習課題が見つかりません」という紛らわしいエラーを避ける）
    if (!(await isContentVisible(supabase, submission.content_id))) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }

    // 演習コンテンツの確認
    const content = submission.content;
    if (!content?.exercise_instructions) {
      return NextResponse.json(
        { error: "この提出に関連する演習課題が見つかりません" },
        { status: 400 }
      );
    }

    // 提出内容の取得（コードは単一/複数ファイルを正規化して扱う）
    let reviewSubmission: ReviewSubmission;
    if (submission.submission_type === "code") {
      const files = getSubmissionCodeFiles(submission);
      if (files.length === 0) {
        return NextResponse.json({ error: "提出内容が空です" }, { status: 400 });
      }

      // 全ファイル合計のコード長チェック
      const totalLength = files.reduce((sum, file) => sum + file.content.length, 0);
      if (totalLength > MAX_CODE_LENGTH) {
        return NextResponse.json(
          { error: `コードが長すぎます（上限: ${MAX_CODE_LENGTH}文字）` },
          { status: 400 }
        );
      }

      reviewSubmission = { type: "code", files };
    } else {
      if (!submission.url) {
        return NextResponse.json({ error: "提出内容が空です" }, { status: 400 });
      }
      reviewSubmission = { type: "url", content: submission.url };
    }

    // GEMINI_API_KEY 確認
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "AIレビュー機能が設定されていません" }, { status: 503 });
    }

    // 同一ユーザー・同一コンテンツでのAIレビュー利用済みチェック（1課題につき1回制限）
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

    // AIレビューレコードをUPSERT（pending）
    const reviewRecord = await upsertPendingAIReview(submissionId);
    if (!reviewRecord) {
      return NextResponse.json({ error: "AIレビューの初期化に失敗しました" }, { status: 500 });
    }

    // processing に更新
    const processingResult = await updateAIReviewProcessing(reviewRecord.id);
    if (!processingResult) {
      return NextResponse.json(
        { error: "AIレビューのステータス更新に失敗しました" },
        { status: 500 }
      );
    }

    // Gemini API 呼び出し
    try {
      const result = await generateReview(
        content.exercise_instructions,
        reviewSubmission,
        content.reference_answer
      );

      // completed 状態で保存
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
