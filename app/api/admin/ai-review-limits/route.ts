import { NextResponse } from "next/server";
import { reopenAIReview, resetAIReviewLimits } from "@/app/services/api/ai-review-server";
import { AdminAiReviewLimitActionSchema, validateRequest } from "@/app/services/api/schemas";
import { requireAdminApi } from "@/app/services/auth/admin-guard";

export async function POST(request: Request) {
  try {
    const admin = await requireAdminApi();
    if (admin.response) {
      return admin.response;
    }
    const performedBy = admin.auth.userId;
    if (performedBy === null) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const validation = await validateRequest(request, AdminAiReviewLimitActionSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { data } = validation;

    if (data.action === "reset") {
      const result = await resetAIReviewLimits({
        userId: data.userId,
        contentId: data.contentId ?? null,
        performedBy,
      });
      if (!result) {
        return NextResponse.json(
          { error: "AIレビュー回数のリセットに失敗しました" },
          { status: 500 }
        );
      }
      if ("notFound" in result) {
        return NextResponse.json(
          { error: "対象のユーザーまたは課題が見つかりません" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, affected: result.affected });
    }

    const result = await reopenAIReview({ submissionId: data.submissionId, performedBy });
    if (!result) {
      return NextResponse.json({ error: "再レビューの許可に失敗しました" }, { status: 500 });
    }
    if (!result.reopened) {
      return NextResponse.json(
        {
          error:
            "再レビューを許可できません（完了したレビューがないか、すでに許可済みか、合格済みです）。画面を更新して確認してください",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("AIレビュー回数操作エラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
