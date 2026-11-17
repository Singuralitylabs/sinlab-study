import { NextResponse } from "next/server";
import {
  AI_CHAT_ANSWER_MAX_LENGTH,
  AI_CHAT_CONTENT_TYPES,
  AI_CHAT_DISABLED_MESSAGE,
  isAiChatEnabled,
} from "@/app/constants/ai-chat";
import { USER_STATUS } from "@/app/constants/user";
import { chatLimitedResponse } from "@/app/lib/ai-chat-limits";
import { AI_CHAT_SYSTEM_PROMPT, buildChatPrompt } from "@/app/lib/ai-chat-prompt";
import { parseStarterFiles } from "@/app/lib/code-file-inputs";
import {
  claimAIChat,
  completeAIChatUsage,
  failAIChatUsage,
  fetchLatestSubmissionForChat,
} from "@/app/services/api/ai-chat-server";
import {
  generateChatReply,
  ReviewGenerationError,
  resolveGeminiApiKey,
} from "@/app/services/api/gemini";
import { fetchVisibleContentForChat } from "@/app/services/api/learning-server";
import { AiChatRequestSchema, validateRequest } from "@/app/services/api/schemas";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { requireLearnerApi } from "@/app/services/auth/admin-guard";

// Route segment config must be a literal. generateChatReply() caps Gemini at
// AI_CHAT_TOTAL_BUDGET_MS (25s); 40s leaves room for the DB round trips. AI_CHAT_STALE_AFTER_MS
// (60s) must stay above this.
export const maxDuration = 40;

const GENERATION_FAILED_MESSAGE =
  "シンラビがうまく答えられなかったみたい。少し時間を置いてから、もう一度送ってね（回数は減っていません）";

/** A longer reply would not fit the history and saved-note caps, so it is cut here once. */
function capAnswer(answer: string): string {
  if (answer.length <= AI_CHAT_ANSWER_MAX_LENGTH) {
    return answer;
  }
  const note = "\n\n…（長いので、ここで切ったよ）";
  return `${answer.slice(0, AI_CHAT_ANSWER_MAX_LENGTH - note.length)}${note}`;
}

// Never log the question, the history or the answer: Vercel keeps function logs.
export async function POST(request: Request) {
  try {
    if (!isAiChatEnabled()) {
      return NextResponse.json({ error: AI_CHAT_DISABLED_MESSAGE }, { status: 503 });
    }

    const validation = await validateRequest(request, AiChatRequestSchema);
    if (!validation.success) {
      return validation.response;
    }
    const { contentId, message, history } = validation.data;

    const guard = await requireLearnerApi();
    if (guard.response) {
      return guard.response;
    }
    const { userId, userStatus } = guard.auth;
    if (userStatus !== USER_STATUS.ACTIVE && userStatus !== USER_STATUS.TRIAL) {
      return NextResponse.json({ error: "アクセスが拒否されています" }, { status: 403 });
    }

    const apiKey = resolveGeminiApiKey(userStatus);
    if (!apiKey) {
      return NextResponse.json({ error: AI_CHAT_DISABLED_MESSAGE }, { status: 503 });
    }

    // Normal client only (RLS + column grants): the prompt must never see reference_answer,
    // grading_rubric or another learner's rows, and the service_role delivery paths stay at two.
    const supabase = await createServerSupabaseClient();
    const content = await fetchVisibleContentForChat(supabase, contentId);
    if (!content) {
      return NextResponse.json({ error: "対象のコンテンツにアクセスできません" }, { status: 403 });
    }
    if (!AI_CHAT_CONTENT_TYPES.includes(content.content_type)) {
      return NextResponse.json(
        { error: "このコンテンツではシンラビに相談できません" },
        { status: 400 }
      );
    }

    const latest =
      content.content_type === "exercise"
        ? await fetchLatestSubmissionForChat(supabase, userId, contentId)
        : { submission: null, review: null };

    const now = new Date();
    const claim = await claimAIChat({ userId, contentId, userStatus, now });
    if (!claim) {
      return NextResponse.json({ error: "相談回数の確認に失敗しました" }, { status: 500 });
    }
    if (claim.kind === "limited") {
      const limited = chatLimitedResponse(claim.reason, now, claim.limits);
      return NextResponse.json(
        {
          error: limited.message,
          reason: limited.reason,
          remaining: limited.remaining,
          resetsAt: limited.resetsAt,
        },
        { status: 429 }
      );
    }

    const contents = buildChatPrompt(
      {
        themeName: content.themeName,
        phaseName: content.phaseName,
        title: content.title,
        contentType: content.content_type === "text" ? "text" : "exercise",
        textContent: content.text_content,
        exerciseInstructions: content.exercise_instructions,
        hint: content.hint,
        starterFiles: parseStarterFiles(content.starter_files),
        latestSubmission: latest.submission,
        latestReview: latest.review,
      },
      history,
      message
    );

    let reply: Awaited<ReturnType<typeof generateChatReply>>;
    try {
      reply = await generateChatReply({
        systemInstruction: AI_CHAT_SYSTEM_PROMPT,
        contents,
        apiKey,
      });
    } catch (error) {
      // gemini.ts already logged the (redacted) cause.
      await failAIChatUsage(
        claim.usageId,
        error instanceof ReviewGenerationError ? error.usage : undefined
      );
      return NextResponse.json({ error: GENERATION_FAILED_MESSAGE }, { status: 502 });
    }

    // The answer is already billed; a failed bookkeeping write must not hide it from the learner.
    await completeAIChatUsage(claim.usageId, {
      modelUsed: reply.modelUsed,
      promptTokens: reply.promptTokens,
      completionTokens: reply.completionTokens,
      thoughtsTokens: reply.thoughtsTokens,
    });

    return NextResponse.json({
      answer: capAnswer(reply.answer),
      remaining: claim.remaining,
      limit:
        userStatus === USER_STATUS.TRIAL ? claim.limits.trialLifetime : claim.limits.activePerDay,
    });
  } catch (error) {
    console.error("AIチャットAPIエラー:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "内部エラーが発生しました" }, { status: 500 });
  }
}
