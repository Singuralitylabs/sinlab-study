import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

const { revalidateTag, unstable_cache } = vi.hoisted(() => {
  const revalidateTagFn = vi.fn();
  const unstableCacheFn = vi.fn((fn: (...args: never[]) => Promise<unknown>) => fn);
  return { revalidateTag: revalidateTagFn, unstable_cache: unstableCacheFn };
});

vi.mock("next/cache", () => ({
  revalidateTag,
  unstable_cache,
}));

vi.mock("@/app/services/api/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
}));

import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import {
  AI_REVIEW_LIMITS_CACHE_TAG,
  fetchAIReviewLimits,
  fetchCurrentAIReviewLimits,
  updateAIReviewLimits,
} from "@/app/services/api/ai-review-settings-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchCurrentAIReviewLimits (#502)", () => {
  it("表示用は unstable_cache 経由で admin クライアントを使い、claim 用 fetchAIReviewLimits とは別経路", async () => {
    const admin = createMockSupabaseClient({
      tableResults: {
        ai_review_settings: {
          data: {
            active_per_content_per_day: 3,
            active_per_day: 15,
            trial_per_content_lifetime: 2,
            updated_at: null,
            updated_by: null,
          },
          error: null,
        },
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(admin as never);

    const limits = await fetchCurrentAIReviewLimits();

    // unstable_cache wraps at module load (before beforeEach); assert the cached body path.
    expect(createAdminSupabaseClient).toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(limits.active.perContentPerDay).toBe(3);
    expect(limits.active.perDay).toBe(15);
  });

  it("fetchAIReviewLimits は渡されたクライアントで都度読み、キャッシュタグを使わない", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        ai_review_settings: {
          data: {
            active_per_content_per_day: 4,
            active_per_day: 20,
            trial_per_content_lifetime: 1,
            updated_at: null,
            updated_by: null,
          },
          error: null,
        },
      },
    });

    const limits = await fetchAIReviewLimits(client as never);

    expect(limits.active.perContentPerDay).toBe(4);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("読めないときは既定値へ戻す", async () => {
    vi.mocked(createAdminSupabaseClient).mockRejectedValue(new Error("no key"));
    await expect(fetchCurrentAIReviewLimits()).resolves.toEqual(AI_REVIEW_LIMITS);
  });
});

describe("updateAIReviewLimits (#502)", () => {
  it("更新成功後に ai-review-limits タグを即時 expire する", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        ai_review_settings: { data: [{ id: 1 }], error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const result = await updateAIReviewLimits(
      { active: { perContentPerDay: 3, perDay: 20 }, trial: { perContentLifetime: 2 } },
      1
    );

    expect(result).toEqual({ error: null, updated: true });
    expect(revalidateTag).toHaveBeenCalledWith(AI_REVIEW_LIMITS_CACHE_TAG, { expire: 0 });
  });

  it("0行更新では revalidateTag しない", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        ai_review_settings: { data: [], error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const result = await updateAIReviewLimits(
      { active: { perContentPerDay: 3, perDay: 20 }, trial: { perContentLifetime: 2 } },
      1
    );

    expect(result.updated).toBe(false);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
