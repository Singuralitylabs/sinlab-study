import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchContentsByWeekId,
  fetchContentVisibilitySummariesByWeekIds,
  fetchPhaseById,
  fetchPublishedPhases,
  fetchThemeProgressSummaries,
  fetchUserProgressByContentId,
  fetchUserProgressByContentIds,
  fetchWeeksWithContentsByPhaseId,
  isContentLockedForUser,
  isContentVisible,
} from "@/app/services/api/learning-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

// ----------------------------------------------------------------
// fetchPublishedPhases
// ----------------------------------------------------------------
describe("fetchPublishedPhases", () => {
  it("正常時、フェーズ一覧を返す", async () => {
    const phases = [
      { id: 1, title: "Phase 1", display_order: 1 },
      { id: 2, title: "Phase 2", display_order: 2 },
    ];
    const mockClient = createMockSupabaseClient({ queryResult: { data: phases, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPublishedPhases();

    expect(result.data).toEqual(phases);
    expect(result.error).toBeNull();
  });

  it("DB エラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPublishedPhases();

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchPhaseById
// ----------------------------------------------------------------
describe("fetchPhaseById", () => {
  it("正常時、指定 ID のフェーズを返す", async () => {
    const phase = { id: 1, title: "Phase 1", is_published: true, is_deleted: false };
    const mockClient = createMockSupabaseClient({ queryResult: { data: phase, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPhaseById(1);

    expect(result.data).toEqual(phase);
    expect(result.error).toBeNull();
  });

  it("DB エラー時（該当なし等）、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPhaseById(999);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchContentsByWeekId
// ----------------------------------------------------------------
describe("fetchContentsByWeekId", () => {
  it("正常時、コンテンツ一覧を返す", async () => {
    const contents = [
      { id: 10, title: "Content A", content_type: "video", display_order: 1 },
      { id: 11, title: "Content B", content_type: "text", display_order: 2 },
    ];
    const mockClient = createMockSupabaseClient({ queryResult: { data: contents, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentsByWeekId(1);

    expect(result.data).toEqual(contents);
    expect(result.error).toBeNull();
  });

  it("DB エラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentsByWeekId(1);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchThemeProgressSummaries
// ----------------------------------------------------------------
describe("fetchThemeProgressSummaries", () => {
  /**
   * テーブルごとに異なるクエリ結果を返すモッククライアントを作る。
   * progress に配列を渡すと user_progress への呼び出しごとに順番に消費する（ページング検証用）。
   */
  function createPerTableMockClient(results: {
    themes: { data: unknown; error: unknown };
    progress?: { data: unknown; error: unknown } | { data: unknown; error: unknown }[];
  }) {
    const progressQueue = Array.isArray(results.progress) ? [...results.progress] : null;
    const mockClient = createMockSupabaseClient();
    mockClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === "learning_themes") {
        return createQueryBuilder(results.themes);
      }
      if (progressQueue) {
        return createQueryBuilder(progressQueue.shift() ?? { data: [], error: null });
      }
      return createQueryBuilder(
        (results.progress as { data: unknown; error: unknown } | undefined) ?? {
          data: null,
          error: null,
        }
      );
    });
    return mockClient;
  }

  const nestedThemes = [
    {
      id: 1,
      name: "Theme 1",
      display_order: 1,
      phases: [
        {
          id: 10,
          weeks: [
            { id: 100, contents: [{ id: 1000 }, { id: 1001 }] },
            { id: 101, contents: [{ id: 1002 }] },
          ],
        },
      ],
    },
    {
      id: 2,
      name: "Theme 2",
      display_order: 2,
      phases: [],
    },
  ];

  it("正常時、テーマごとの総数・完了数を集計して返す（テーマからphasesは除去）", async () => {
    const mockClient = createPerTableMockClient({
      themes: { data: nestedThemes, error: null },
      progress: { data: [{ content_id: 1000 }, { content_id: 1002 }], error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchThemeProgressSummaries(1);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        theme: { id: 1, name: "Theme 1", display_order: 1 },
        totalContents: 3,
        completedContents: 2,
      },
      {
        theme: { id: 2, name: "Theme 2", display_order: 2 },
        totalContents: 0,
        completedContents: 0,
      },
    ]);
  });

  it("コンテンツが1件もない場合、user_progress を照会しない", async () => {
    const mockClient = createPerTableMockClient({
      themes: { data: [{ id: 2, name: "Theme 2", display_order: 2, phases: [] }], error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchThemeProgressSummaries(1);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        theme: { id: 2, name: "Theme 2", display_order: 2 },
        totalContents: 0,
        completedContents: 0,
      },
    ]);
    expect(mockClient.from).toHaveBeenCalledTimes(1);
    expect(mockClient.from).toHaveBeenCalledWith("learning_themes");
  });

  it("テーマ取得エラー時、data: null とエラーを返す", async () => {
    const mockClient = createPerTableMockClient({
      themes: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchThemeProgressSummaries(1);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });

  it("進捗取得エラー時、エラーにせず完了数0のサマリーを返す（テーマ一覧の表示を維持）", async () => {
    const mockClient = createPerTableMockClient({
      themes: { data: nestedThemes, error: null },
      progress: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchThemeProgressSummaries(1);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        theme: { id: 1, name: "Theme 1", display_order: 1 },
        totalContents: 3,
        completedContents: 0,
      },
      {
        theme: { id: 2, name: "Theme 2", display_order: 2 },
        totalContents: 0,
        completedContents: 0,
      },
    ]);
  });

  it("進捗が1000行を超える場合、ページングで全件を集計する", async () => {
    const contentCount = 1500;
    const themesData = [
      {
        id: 1,
        name: "Theme 1",
        display_order: 1,
        phases: [
          {
            id: 10,
            weeks: [
              {
                id: 100,
                contents: Array.from({ length: contentCount }, (_, i) => ({ id: i + 1 })),
              },
            ],
          },
        ],
      },
    ];
    // 1ページ目: 1000行ちょうど → 2ページ目: 残り300行
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ content_id: i + 1 }));
    const page2 = Array.from({ length: 300 }, (_, i) => ({ content_id: 1000 + i + 1 }));
    const mockClient = createPerTableMockClient({
      themes: { data: themesData, error: null },
      progress: [
        { data: page1, error: null },
        { data: page2, error: null },
      ],
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchThemeProgressSummaries(1);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        theme: { id: 1, name: "Theme 1", display_order: 1 },
        totalContents: contentCount,
        completedContents: 1300,
      },
    ]);
    // learning_themes 1回 + user_progress 2ページ分
    expect(mockClient.from).toHaveBeenCalledTimes(3);
  });
});

// ----------------------------------------------------------------
// fetchUserProgressByContentIds
// ----------------------------------------------------------------
describe("fetchUserProgressByContentIds", () => {
  it("contentIds が空配列の場合、Supabase を呼ばずに空の Map を返す", async () => {
    const mockClient = createMockSupabaseClient();
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentIds(1, []);

    expect(result.data).toEqual(new Map());
    expect(result.error).toBeNull();
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("正常時、content_id → is_completed の Map を返す", async () => {
    const progressRows = [
      { content_id: 10, is_completed: true },
      { content_id: 11, is_completed: false },
    ];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: progressRows, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentIds(1, [10, 11]);

    const expected = new Map<number, boolean>([
      [10, true],
      [11, false],
    ]);
    expect(result.data).toEqual(expected);
    expect(result.error).toBeNull();
  });

  it("DB エラー時、空の Map とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentIds(1, [10]);

    expect(result.data).toEqual(new Map());
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchUserProgressByContentId
// ----------------------------------------------------------------
describe("fetchUserProgressByContentId", () => {
  it("進捗が存在し完了している場合、isCompleted: true を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { is_completed: true }, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentId(1, 10);

    expect(result.isCompleted).toBe(true);
    expect(result.error).toBeNull();
  });

  it("進捗レコードが存在しない場合、isCompleted: false を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentId(1, 10);

    expect(result.isCompleted).toBe(false);
    expect(result.error).toBeNull();
  });

  it("DB エラー時、isCompleted: false とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentId(1, 10);

    expect(result.isCompleted).toBe(false);
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchContentVisibilitySummariesByWeekIds
// ----------------------------------------------------------------
describe("fetchContentVisibilitySummariesByWeekIds", () => {
  it("weekIds が空配列の場合、Supabase を呼ばずに空配列を返す", async () => {
    const mockClient = createMockSupabaseClient();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentVisibilitySummariesByWeekIds([]);

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("正常時、service_role クライアントでコンテンツサマリーを返す（お試し非公開分も含む）", async () => {
    const summaries = [
      {
        id: 1,
        title: "公開コンテンツ",
        content_type: "video",
        display_order: 1,
        is_open_to_trial: true,
        week_id: 100,
      },
      {
        id: 2,
        title: "お試し非公開コンテンツ",
        content_type: "exercise",
        display_order: 2,
        is_open_to_trial: false,
        week_id: 100,
      },
    ];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: summaries, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentVisibilitySummariesByWeekIds([100]);

    expect(result.data).toEqual(summaries);
    expect(result.error).toBeNull();
  });

  it("DB エラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentVisibilitySummariesByWeekIds([100]);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchWeeksWithContentsByPhaseId
// ----------------------------------------------------------------
describe("fetchWeeksWithContentsByPhaseId", () => {
  it("正常時、週ごとにコンテンツサマリーをグルーピングして返す", async () => {
    const weeks = [
      { id: 100, name: "Week 1", display_order: 1 },
      { id: 101, name: "Week 2", display_order: 2 },
    ];
    const summaries = [
      {
        id: 1,
        title: "Content A",
        content_type: "video",
        display_order: 1,
        is_open_to_trial: true,
        week_id: 100,
      },
      {
        id: 2,
        title: "Content B",
        content_type: "text",
        display_order: 2,
        is_open_to_trial: false,
        week_id: 100,
      },
    ];
    const mockServerClient = createMockSupabaseClient({
      queryResult: { data: weeks, error: null },
    });
    const mockAdminClient = createMockSupabaseClient({
      queryResult: { data: summaries, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);

    const result = await fetchWeeksWithContentsByPhaseId(1);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { id: 100, name: "Week 1", display_order: 1, contents: summaries },
      { id: 101, name: "Week 2", display_order: 2, contents: [] },
    ]);
  });

  it("週一覧取得エラー時、data: null とエラーを返す（コンテンツは照会しない）", async () => {
    const mockServerClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);

    const result = await fetchWeeksWithContentsByPhaseId(1);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("週が0件の場合、コンテンツを照会せず空配列を返す", async () => {
    const mockServerClient = createMockSupabaseClient({ queryResult: { data: [], error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);

    const result = await fetchWeeksWithContentsByPhaseId(1);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// isContentLockedForUser
// ----------------------------------------------------------------
describe("isContentLockedForUser", () => {
  it("pending かつ お試し非公開の場合、true を返す", () => {
    expect(isContentLockedForUser("pending", false)).toBe(true);
  });

  it("pending でも お試し公開の場合、false を返す", () => {
    expect(isContentLockedForUser("pending", true)).toBe(false);
  });

  it("active の場合、お試し公開フラグに関わらず false を返す", () => {
    expect(isContentLockedForUser("active", false)).toBe(false);
    expect(isContentLockedForUser("active", true)).toBe(false);
  });

  it("rejected / null の場合、false を返す（画面遷移自体が別レイヤーで遮断される想定）", () => {
    expect(isContentLockedForUser("rejected", false)).toBe(false);
    expect(isContentLockedForUser(null, false)).toBe(false);
  });
});

// ----------------------------------------------------------------
// isContentVisible
// ----------------------------------------------------------------
describe("isContentVisible", () => {
  it("対象コンテンツが取得できる場合、true を返す", async () => {
    const mockClient = createMockSupabaseClient({ queryResult: { data: { id: 1 }, error: null } });

    const result = await isContentVisible(mockClient as never, 1);

    expect(result).toBe(true);
  });

  it("0行（お試し非公開・未公開・存在しないID）の場合、false を返す", async () => {
    const mockClient = createMockSupabaseClient({ queryResult: { data: null, error: null } });

    const result = await isContentVisible(mockClient as never, 999);

    expect(result).toBe(false);
  });

  it("DB エラー時、エラーをログした上で false を返す（fail-closed）", async () => {
    const mockClient = createMockSupabaseClient({ queryResult: { data: null, error: dbError } });
    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = await isContentVisible(mockClient as never, 1);

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "コンテンツ可視性チェックエラー:",
      dbError.message
    );
  });
});
