import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchContentsByWeekId,
  fetchPhaseById,
  fetchPublishedPhases,
  fetchThemeProgressSummaries,
  fetchUserProgressByContentId,
  fetchUserProgressByContentIds,
} from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";

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
  /** テーブルごとに異なるクエリ結果を返すモッククライアントを作る */
  function createPerTableMockClient(results: {
    themes: { data: unknown; error: unknown };
    progress?: { data: unknown; error: unknown };
  }) {
    const mockClient = createMockSupabaseClient();
    mockClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === "learning_themes") {
        return createQueryBuilder(results.themes);
      }
      return createQueryBuilder(results.progress ?? { data: null, error: null });
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

  it("進捗取得エラー時、data: null とエラーを返す", async () => {
    const mockClient = createPerTableMockClient({
      themes: { data: nestedThemes, error: null },
      progress: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchThemeProgressSummaries(1);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
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
