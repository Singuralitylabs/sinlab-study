import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchGettingStartedProgress,
  fetchOnboardingStatus,
  markOnboardingCompleted,
} from "@/app/services/api/onboarding-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchOnboardingStatus", () => {
  it("未完了（NULL）のとき completedAt は null", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { onboarding_completed_at: null }, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchOnboardingStatus(2);

    expect(result.data).toEqual({ completedAt: null });
    expect(result.error).toBeNull();
  });

  it("完了済みのとき時刻を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { onboarding_completed_at: "2026-09-22T00:00:00+00:00" }, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchOnboardingStatus(2);

    expect(result.data).toEqual({ completedAt: "2026-09-22T00:00:00+00:00" });
    expect(result.error).toBeNull();
  });

  it("クエリ失敗時は data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchOnboardingStatus(2);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

describe("fetchGettingStartedProgress", () => {
  it("未達成のとき両方 false", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        submissions: { data: null, error: null },
        ai_reviews: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchGettingStartedProgress(2);

    expect(result.data).toEqual({ hasSubmission: false, hasCompletedReview: false });
    expect(result.error).toBeNull();
    const from = mockClient.from as ReturnType<typeof vi.fn>;
    expect(from).toHaveBeenCalledWith("submissions");
    expect(from).toHaveBeenCalledWith("ai_reviews");
  });

  it("提出あり・レビュー未完了のとき一部達成", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        submissions: { data: { id: 1 }, error: null },
        ai_reviews: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchGettingStartedProgress(2);

    expect(result.data).toEqual({ hasSubmission: true, hasCompletedReview: false });
  });

  it("全達成のとき両方 true", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        submissions: { data: { id: 1 }, error: null },
        ai_reviews: { data: { id: 10 }, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchGettingStartedProgress(2);

    expect(result.data).toEqual({ hasSubmission: true, hasCompletedReview: true });
  });

  it("提出クエリ失敗時は提出だけ未達成にし、レビューの結果は維持する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        submissions: { data: null, error: dbError },
        ai_reviews: { data: { id: 10 }, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchGettingStartedProgress(2);

    expect(result.data).toEqual({ hasSubmission: false, hasCompletedReview: true });
    expect(result.error).toEqual(dbError);
  });

  it("両クエリ失敗時は両方未達成にし、最初のエラーを返す", async () => {
    const reviewError = { message: "review error", code: "PGRST002" };
    const mockClient = createMockSupabaseClient({
      tableResults: {
        submissions: { data: null, error: dbError },
        ai_reviews: { data: null, error: reviewError },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchGettingStartedProgress(2);

    expect(result.data).toEqual({ hasSubmission: false, hasCompletedReview: false });
    expect(result.error).toEqual(dbError);
  });

  it("レビュークエリ失敗時は提出の達成だけ維持して継続する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        submissions: { data: { id: 1 }, error: null },
        ai_reviews: { data: null, error: dbError },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchGettingStartedProgress(2);

    expect(result.data).toEqual({ hasSubmission: true, hasCompletedReview: false });
    expect(result.error).toEqual(dbError);
  });

  it("存在確認に limit(1) を使い全件取得しない", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: {
        submissions: { data: null, error: null },
        ai_reviews: { data: null, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchGettingStartedProgress(2);

    const submissionsBuilder = (mockClient.from as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(submissionsBuilder.limit).toHaveBeenCalledWith(1);
  });
});

describe("markOnboardingCompleted", () => {
  it("users を id 絞りで onboarding_completed_at の1列のみ更新する", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: null } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await markOnboardingCompleted(2);

    expect(result.error).toBeNull();
    expect(mockClient.from).toHaveBeenCalledWith("users");
    const builder = mockClient.from.mock.results[0]?.value;
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_completed_at: expect.any(String) })
    );
    expect(Object.keys(builder.update.mock.calls[0]?.[0] ?? {})).toEqual([
      "onboarding_completed_at",
    ]);
    expect(builder.eq).toHaveBeenCalledWith("id", 2);
  });

  it("DB エラー時はエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      tableResults: { users: { data: null, error: dbError } },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await markOnboardingCompleted(2);

    expect(result.error).toEqual(dbError);
  });
});
