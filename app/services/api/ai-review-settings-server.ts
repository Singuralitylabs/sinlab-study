import type { PostgrestError } from "@supabase/supabase-js";
import { revalidateTag, unstable_cache } from "next/cache";
import { AI_REVIEW_LIMITS, type AIReviewLimits } from "@/app/constants/gemini";
import { parseAIReviewLimits } from "@/app/lib/ai-review-limits";
import { createAdminSupabaseClient, createServerSupabaseClient } from "./supabase-server";

type SettingsClient =
  | Awaited<ReturnType<typeof createAdminSupabaseClient>>
  | Awaited<ReturnType<typeof createServerSupabaseClient>>;

const SETTINGS_COLUMNS =
  "active_per_content_per_day, active_per_day, trial_per_content_lifetime, updated_at, updated_by";

/** Tag for display-only limits cache. Claim path must not use this cache (#502). */
export const AI_REVIEW_LIMITS_CACHE_TAG = "ai-review-limits";

/** 30–60s window from #502; admin save revalidateTag clears immediately. */
const AI_REVIEW_LIMITS_CACHE_SECONDS = 60;

/**
 * The limits in force. Never throws and never caches: a read error or an out-of-range row falls
 * back to AI_REVIEW_LIMITS so a settings outage cannot stop learners from getting reviews.
 * Used by claim / admin paths that must see the latest values.
 */
export async function fetchAIReviewLimits(supabase: SettingsClient): Promise<AIReviewLimits> {
  try {
    const { data, error } = await supabase
      .from("ai_review_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("AIレビュー上限値の取得エラー（既定値を使います）:", error.message);
      return AI_REVIEW_LIMITS;
    }
    return parseAIReviewLimits(data);
  } catch (error) {
    console.error("AIレビュー上限値の取得エラー（既定値を使います）:", error);
    return AI_REVIEW_LIMITS;
  }
}

/**
 * Cookie-free read for the shared display cache. Settings SELECT is non-sensitive (database.md
 * 6.20); service_role avoids putting cookies() inside unstable_cache (#502).
 */
const readCachedDisplayLimits = unstable_cache(
  async (): Promise<AIReviewLimits> => fetchAIReviewLimits(await createAdminSupabaseClient()),
  ["ai-review-limits-display"],
  { revalidate: AI_REVIEW_LIMITS_CACHE_SECONDS, tags: [AI_REVIEW_LIMITS_CACHE_TAG] }
);

/**
 * Display-only limits for home / content / upgrade. Short-lived cache; admin PUT revalidates.
 * Fail-safe to AI_REVIEW_LIMITS. Must not be used for claim / cost gating.
 */
export async function fetchCurrentAIReviewLimits(): Promise<AIReviewLimits> {
  try {
    return await readCachedDisplayLimits();
  } catch (error) {
    console.error("AIレビュー上限値の取得エラー（既定値を使います）:", error);
    return AI_REVIEW_LIMITS;
  }
}

export interface AIReviewSettingsForAdmin {
  limits: AIReviewLimits;
  updatedAt: string | null;
  updatedByName: string | null;
  /** true when the row can't be read or holds invalid values, i.e. the code defaults are in force. */
  usingDefaults: boolean;
}

/** Settings for the admin screen, read with the admin's own session. */
export async function fetchAIReviewSettingsForAdmin(): Promise<{
  data: AIReviewSettingsForAdmin | null;
  error: string | null;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("ai_review_settings")
      .select(SETTINGS_COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("AIレビュー上限値の取得エラー:", error.message);
      return { data: null, error: "AIレビューの上限値の取得に失敗しました" };
    }

    const limits = parseAIReviewLimits(data);
    const usingDefaults = limits === AI_REVIEW_LIMITS;

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
    console.error("AIレビュー上限値の取得エラー:", error);
    return { data: null, error: "AIレビューの上限値の取得に失敗しました" };
  }
}

/** Updates the three limits with the admin's session (RLS: admin only; 0 rows = refused). */
export async function updateAIReviewLimits(
  limits: AIReviewLimits,
  updatedBy: number
): Promise<{ error: PostgrestError | null; updated: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_review_settings")
    .update({
      active_per_content_per_day: limits.active.perContentPerDay,
      active_per_day: limits.active.perDay,
      trial_per_content_lifetime: limits.trial.perContentLifetime,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", 1)
    .select("id");
  if (error) {
    console.error("AIレビュー上限値の更新エラー:", error.message);
    return { error, updated: false };
  }
  const updated = (data?.length ?? 0) > 0;
  if (updated) {
    // Immediate expire so home / content / upgrade show the new caps on the next request (#502).
    revalidateTag(AI_REVIEW_LIMITS_CACHE_TAG, { expire: 0 });
  }
  return { error: null, updated };
}
