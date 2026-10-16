import { type NextRequest, NextResponse } from "next/server";
import { FEEDBACK_DISABLED_MESSAGE, isFeedbackEnabled } from "@/app/constants/feedback";
import { runAfterResponse } from "@/app/lib/after-response";
import { countRecentFeedbacksForUser, insertFeedback } from "@/app/services/api/feedback-server";
import { FeedbackCreateSchema, validateRequest } from "@/app/services/api/schemas";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";
import { buildAppUrl } from "@/app/services/notifications/email-templates";
import { sendSlackFeedbackNotification } from "@/app/services/notifications/slack";

// Slack runs in after(); keep the function alive past the default 10s so the webhook is not cut off.
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    if (!isFeedbackEnabled()) {
      return NextResponse.json({ error: FEEDBACK_DISABLED_MESSAGE }, { status: 503 });
    }

    const validation = await validateRequest(request, FeedbackCreateSchema);
    if (!validation.success) {
      return validation.response;
    }

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId } = guard.auth;

    const { count, error: countError } = await countRecentFeedbacksForUser(userId);
    if (countError) {
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }
    if (count > 0) {
      return NextResponse.json(
        { error: "短時間に連続して送信できません。しばらくしてから再度お試しください" },
        { status: 429 }
      );
    }

    const { category, body, pageUrl, userAgent } = validation.data;
    const { data, error } = await insertFeedback({
      userId,
      category,
      body,
      pageUrl: pageUrl ?? null,
      userAgent: userAgent ?? null,
    });
    if (error || !data) {
      return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
    }

    // Slack must not change the API outcome; after() keeps the webhook from being cut off.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const slackParams = {
      feedbackId: data.id,
      category: data.category,
      body: data.body,
      pageUrl: data.page_url,
      manageUrl: appUrl ? buildAppUrl(appUrl, `/manage/feedbacks/${data.id}`) : null,
    };
    void runAfterResponse(async () => {
      try {
        await sendSlackFeedbackNotification(slackParams);
      } catch (slackError) {
        console.error("[Slack通知] フィードバック通知で予期しないエラー:", slackError);
      }
    });

    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    console.error("フィードバックAPIエラー:", error);
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
