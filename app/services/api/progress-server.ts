import type { PostgrestError } from "@supabase/supabase-js";
import { ANALYTICS_EVENT } from "@/app/constants/analytics";
import { runAfterResponse } from "@/app/lib/after-response";
import { shouldTrackFirstCompletion } from "@/app/lib/analytics-funnel";
import { trackServerEvent } from "@/app/services/analytics/track-server";
import type { UserRoleType, UserStatusType } from "@/app/types";
import { issueCertificateIfEligible } from "./certificates-server";
import { contentRequiresReviewPass, userHasPassingReview } from "./review-pass-server";
import type { createServerSupabaseClient } from "./supabase-server";

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const PASS_REQUIRED_ERROR = "AIレビューで合格すると完了になります";
const UNCOMPLETE_FORBIDDEN_ERROR = "合格判定のある演習は未完了に戻せません";
const PROGRESS_WRITE_ERROR = "進捗の更新に失敗しました";

export type SaveContentProgressResult =
  | { ok: true }
  | { ok: false; status: 403 | 500; error: string };

/** Trigger raises 42501. Map it to the same messages as the explicit checks. */
function reviewPassViolationMessage(
  error: Pick<PostgrestError, "code" | "message">
): string | null {
  if (error.code !== "42501") {
    return null;
  }
  if (error.message.includes("cannot be cleared")) {
    return UNCOMPLETE_FORBIDDEN_ERROR;
  }
  return PASS_REQUIRED_ERROR;
}

/**
 * Writes user_progress with the caller's session (not service_role) and, on completion, records
 * first_content_completed and schedules issueCertificateIfEligible — the same path as
 * POST /api/progress. Pass-gated exercises cannot be completed without a passing review, and
 * cannot be marked incomplete. The trigger is the backstop when the pre-check cannot run.
 */
export async function saveContentProgress(params: {
  supabase: ServerClient;
  userId: number;
  userStatus: UserStatusType | null;
  userRole: UserRoleType | null;
  contentId: number;
  isCompleted: boolean;
}): Promise<SaveContentProgressResult> {
  const { supabase, userId, userStatus, userRole, contentId, isCompleted } = params;

  const gate = await contentRequiresReviewPass(supabase, contentId);
  // A lookup failure falls through to the write. The trigger still rejects a pass-gated row.
  if (gate.error === null && gate.requiresPass) {
    if (!isCompleted) {
      return { ok: false, status: 403, error: UNCOMPLETE_FORBIDDEN_ERROR };
    }
    const pass = await userHasPassingReview(supabase, userId, contentId);
    if (pass.error) {
      return { ok: false, status: 500, error: PROGRESS_WRITE_ERROR };
    }
    if (!pass.hasPass) {
      return { ok: false, status: 403, error: PASS_REQUIRED_ERROR };
    }
  }

  // Count rows that have ever been completed, before the upsert. is_completed is cleared
  // when the user toggles completion off, so counting it would send first_content_completed
  // again on the next complete. ever_completed stays true. A count failure skips the event.
  let existingCompletedCount: number | null = null;
  if (isCompleted) {
    const { count, error: countError } = await supabase
      .from("user_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("ever_completed", true);
    if (countError) {
      console.error("進捗完了数の取得エラー:", countError.message);
    } else {
      existingCompletedCount = count ?? 0;
    }
  }

  const { error: upsertError } = await supabase.from("user_progress").upsert(
    {
      user_id: userId,
      content_id: contentId,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
      // Uncomplete must not send false, or the next complete looks like the first one.
      ...(isCompleted ? { ever_completed: true } : {}),
    },
    { onConflict: "user_id,content_id" }
  );

  if (upsertError) {
    console.error("進捗更新エラー:", upsertError);
    const violation = reviewPassViolationMessage(upsertError);
    if (violation) {
      return { ok: false, status: 403, error: violation };
    }
    return { ok: false, status: 500, error: PROGRESS_WRITE_ERROR };
  }

  if (
    existingCompletedCount !== null &&
    shouldTrackFirstCompletion(isCompleted, existingCompletedCount) &&
    userStatus
  ) {
    trackServerEvent(ANALYTICS_EVENT.FIRST_CONTENT_COMPLETED, { status: userStatus });
  }

  // Issue the theme certificate when this completion finished the theme. Deferred with after()
  // so the aggregation queries do not delay the response; outside request scope (where after()
  // throws) it just runs inline. The helper never throws and its result is not used: a failure
  // (or the email) must not change this response.
  if (isCompleted) {
    await runAfterResponse(() =>
      issueCertificateIfEligible({ userId, userStatus, userRole, contentId })
    );
  }

  return { ok: true };
}
