import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import { fetchExerciseReviewPassState } from "@/app/services/api/review-pass-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchExerciseReviewPassState (#502)", () => {
  it("RPC の JSON をページ用のフラグに写す", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        rpcResults: {
          get_exercise_review_pass_state: {
            data: {
              requires_pass: true,
              pass_unachievable: false,
              has_passing_review: true,
            },
            error: null,
          },
        },
      }) as never
    );

    await expect(fetchExerciseReviewPassState(9)).resolves.toEqual({
      requiresPass: true,
      passUnachievable: false,
      hasPassingReview: true,
    });
  });

  it("エラー時はフェイルクローズで全部 false", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        rpcResults: {
          get_exercise_review_pass_state: {
            data: null,
            error: { message: "boom", code: "XX000" },
          },
        },
      }) as never
    );

    await expect(fetchExerciseReviewPassState(1)).resolves.toEqual({
      requiresPass: false,
      passUnachievable: false,
      hasPassingReview: false,
    });
  });
});
