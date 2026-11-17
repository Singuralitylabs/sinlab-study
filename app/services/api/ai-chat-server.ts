import type { PostgrestError } from "@supabase/supabase-js";
import { AI_CHAT_LIMITS, type AIChatLimits } from "@/app/constants/ai-chat";
import { REQUIREMENT_STATUSES } from "@/app/constants/grading";
import { USER_STATUS } from "@/app/constants/user";
import {
  type ChatLimitReason,
  type ChatUsageSummary,
  computeChatUsage,
  parseAIChatLimits,
  staleChatCutoff,
} from "@/app/lib/ai-chat-limits";
import type { ChatReviewSummary, ChatSubmission } from "@/app/lib/ai-chat-prompt";
import { getJstDayWindow } from "@/app/lib/ai-review-limits";
import { getSubmissionCodeFiles } from "@/app/lib/submission-files";
import type { TokenUsage } from "@/app/lib/token-usage";
import type { ReviewRequirementResult, UserStatusType } from "@/app/types";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

type SettingsClient =
  | Awaited<ReturnType<typeof createAdminSupabaseClient>>
  | Awaited<ReturnType<typeof createServerSupabaseClient>>;

type UserClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const SETTINGS_COLUMNS = "active_per_day, trial_lifetime, updated_at, updated_by";

/**
 * The limits in force. Never throws and never caches (the claim must see an admin's change at
 * once): a read error or an out-of-range row falls back to AI_CHAT_LIMITS.
 */
export async function fetchAIChatLimits(supabase: SettingsClient): Promise<AIChatLimits> {
  try {
    const { data, error } = await supabase
      .from("ai_chat_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("AIチャット上限値の取得エラー（既定値を使います）:", error.message);
      return AI_CHAT_LIMITS;
    }
    return parseAIChatLimits(data);
  } catch (error) {
    console.error("AIチャット上限値の取得エラー（既定値を使います）:", error);
    return AI_CHAT_LIMITS;
  }
}

export type AIChatClaim =
  | { kind: "claimed"; usageId: number; remaining: number; limits: AIChatLimits }
  | { kind: "limited"; reason: ChatLimitReason; limits: AIChatLimits };

/**
 * Checks the count and takes one question's slot in one transaction (claim_ai_chat()), so
 * concurrent sends cannot all pass on the same count. null = the RPC failed.
 */
export async function claimAIChat({
  userId,
  contentId,
  userStatus,
  now,
}: {
  userId: number;
  contentId: number;
  userStatus: UserStatusType;
  now: Date;
}): Promise<AIChatClaim | null> {
  const supabase = await createAdminSupabaseClient();
  const limits = await fetchAIChatLimits(supabase);
  const { data, error } = await supabase.rpc("claim_ai_chat", {
    p_user_id: userId,
    p_content_id: contentId,
    p_user_status: userStatus,
    p_stale_before: staleChatCutoff(now).toISOString(),
    p_day_start: getJstDayWindow(now).startIso,
    p_active_per_day: limits.activePerDay,
    p_trial_lifetime: limits.trialLifetime,
  });
  if (error) {
    console.error("AIチャット枠確保エラー:", error.message);
    return null;
  }
  const result = data as {
    outcome?: string;
    usage_id?: number;
    reason?: string;
    remaining?: number;
  } | null;
  if (result?.outcome === "claimed" && typeof result.usage_id === "number") {
    return { kind: "claimed", usageId: result.usage_id, remaining: result.remaining ?? 0, limits };
  }
  if (
    result?.outcome === "limited" &&
    (result.reason === "user_daily" || result.reason === "trial_lifetime")
  ) {
    return { kind: "limited", reason: result.reason, limits };
  }
  console.error("AIチャット枠確保の応答が不正です:", result?.outcome ?? "null");
  return null;
}

/** Records the answered question's model and tokens (no text). false = the write failed. */
export async function completeAIChatUsage(
  usageId: number,
  { modelUsed, promptTokens, completionTokens, thoughtsTokens }: TokenUsage & { modelUsed: string }
): Promise<boolean> {
  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase
    .from("ai_chat_usage")
    .update({
      status: "completed",
      model_used: modelUsed,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      thoughts_tokens: thoughtsTokens,
    })
    .eq("id", usageId);
  if (error) {
    console.error("AIチャット利用記録の更新エラー:", error.message);
    return false;
  }
  return true;
}

/**
 * Gives the question back (failed rows don't count). Best effort: a row left pending stops
 * counting after AI_CHAT_STALE_AFTER_MS anyway. Tokens already billed are kept for cost totals.
 */
export async function failAIChatUsage(usageId: number, usage?: TokenUsage): Promise<void> {
  try {
    const supabase = await createAdminSupabaseClient();
    const { error } = await supabase
      .from("ai_chat_usage")
      .update({
        status: "failed",
        ...(usage
          ? {
              prompt_tokens: usage.promptTokens,
              completion_tokens: usage.completionTokens,
              thoughts_tokens: usage.thoughtsTokens,
            }
          : {}),
      })
      .eq("id", usageId);
    if (error) {
      console.error("AIチャット利用記録の失敗更新エラー:", error.message);
    }
  } catch (error) {
    console.error("AIチャット利用記録の失敗更新エラー:", error);
  }
}

/**
 * Remaining questions for the panel, read with the learner's own session (RLS: own rows). Always
 * filtered by user_id too: an admin's session can read everyone's rows.
 */
export async function fetchAIChatUsageSummary(
  supabase: UserClient,
  userId: number,
  userStatus: UserStatusType | null,
  now: Date
): Promise<{ data: ChatUsageSummary | null; error: PostgrestError | null }> {
  const limits = await fetchAIChatLimits(supabase);
  if (userStatus !== USER_STATUS.ACTIVE && userStatus !== USER_STATUS.TRIAL) {
    return { data: computeChatUsage({ userStatus, rows: [], now, limits }), error: null };
  }
  let query = supabase
    .from("ai_chat_usage")
    .select("status, created_at, counts_toward_limit")
    .eq("user_id", userId)
    .neq("status", "failed");
  if (userStatus === USER_STATUS.ACTIVE) {
    query = query.gte("created_at", getJstDayWindow(now).startIso);
  }
  const { data, error } = await query;
  if (error) {
    console.error("AIチャット利用状況の取得エラー:", error.message);
    return { data: null, error };
  }
  return { data: computeChatUsage({ userStatus, rows: data ?? [], now, limits }), error: null };
}

function parseRequirements(raw: unknown): ReviewRequirementResult[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { requirements?: unknown }).requirements)
  ) {
    return [];
  }
  return ((raw as { requirements: unknown[] }).requirements ?? []).flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const { key, name, status, comment } = entry as Record<string, unknown>;
    if (
      typeof key !== "string" ||
      typeof status !== "string" ||
      !(REQUIREMENT_STATUSES as readonly string[]).includes(status)
    ) {
      return [];
    }
    return [
      {
        key,
        ...(typeof name === "string" ? { name } : {}),
        status: status as ReviewRequirementResult["status"],
        comment: typeof comment === "string" ? comment : "",
      },
    ];
  });
}

/**
 * The learner's latest submission for the content and its completed review summary, with the
 * learner's own session (RLS: own rows). Only one submission: older ones would only add tokens.
 * The review keeps per-requirement status, short comment, pass and score; review_content is left
 * out. A read error drops the section instead of failing the question.
 */
export async function fetchLatestSubmissionForChat(
  supabase: UserClient,
  userId: number,
  contentId: number
): Promise<{ submission: ChatSubmission | null; review: ChatReviewSummary | null }> {
  const { data: row, error } = await supabase
    .from("submissions")
    .select("id, submission_type, code_content, code_files, url")
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("AIチャット用の最新提出の取得エラー:", error.message);
    return { submission: null, review: null };
  }
  if (!row) {
    return { submission: null, review: null };
  }

  let submission: ChatSubmission | null = null;
  if (row.submission_type === "url") {
    submission = row.url ? { type: "url", url: row.url } : null;
  } else {
    const files = getSubmissionCodeFiles(row);
    submission = files.length > 0 ? { type: "code", files } : null;
  }
  if (!submission) {
    return { submission: null, review: null };
  }

  const { data: reviewRow, error: reviewError } = await supabase
    .from("ai_reviews")
    .select("status, overall_score, passed, review_json")
    .eq("submission_id", row.id)
    .eq("status", "completed")
    .maybeSingle();
  if (reviewError) {
    console.error("AIチャット用のレビュー取得エラー:", reviewError.message);
  }
  const review: ChatReviewSummary | null = reviewRow
    ? {
        passed: reviewRow.passed,
        overallScore: reviewRow.overall_score,
        requirements: parseRequirements(reviewRow.review_json),
      }
    : null;
  return { submission, review };
}

export interface AIChatSettingsForAdmin {
  limits: AIChatLimits;
  updatedAt: string | null;
  updatedByName: string | null;
  /** true when the row can't be read or holds invalid values, i.e. the code defaults are in force. */
  usingDefaults: boolean;
}

/** Settings for the admin screen, read with the admin's own session. */
export async function fetchAIChatSettingsForAdmin(): Promise<{
  data: AIChatSettingsForAdmin | null;
  error: string | null;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("ai_chat_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("AIチャット上限値の取得エラー:", error.message);
      return { data: null, error: "シンラビに相談の上限値の取得に失敗しました" };
    }

    const limits = parseAIChatLimits(data);
    const usingDefaults = limits === AI_CHAT_LIMITS;

    let updatedByName: string | null = null;
    if (data?.updated_by != null) {
      const { data: editor } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", data.updated_by)
        .maybeSingle();
      updatedByName = editor?.display_name ?? null;
    }

    return {
      data: { limits, updatedAt: data?.updated_at ?? null, updatedByName, usingDefaults },
      error: null,
    };
  } catch (error) {
    console.error("AIチャット上限値の取得エラー:", error);
    return { data: null, error: "シンラビに相談の上限値の取得に失敗しました" };
  }
}

/** Updates both limits with the admin's session (RLS: admin only; 0 rows = refused). */
export async function updateAIChatLimits(
  limits: AIChatLimits,
  updatedBy: number
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_chat_settings")
    .update({
      active_per_day: limits.activePerDay,
      trial_lifetime: limits.trialLifetime,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", 1)
    .select("id");
  if (error) {
    console.error("AIチャット上限値の更新エラー:", error.message);
    return { error, updated: false };
  }
  return { error: null, updated: (data?.length ?? 0) > 0 };
}
