import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchContentById,
  fetchContentSummariesByWeekIds,
  fetchContentsByWeekId,
  fetchContentVisibilitySummariesByWeekIds,
  fetchPhaseById,
  fetchPhasesByThemeId,
  fetchPublishedPhases,
  fetchPublishedThemes,
  fetchThemeById,
  fetchThemeProgressSummaries,
  fetchUserProgressByContentId,
  fetchUserProgressByContentIds,
  fetchWeekById,
  fetchWeeksWithContentsByPhaseId,
  isContentFullyPublished,
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

  it("member / お試しユーザー（role未指定）の場合、is_published=true で絞り込む", async () => {
    const phase = { id: 1, title: "Phase 1", is_published: true, is_deleted: false };
    const mockClient = createMockSupabaseClient({ queryResult: { data: phase, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchPhaseById(1);

    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
  });

  it.each([
    "admin",
    "maintainer",
  ] as const)("%s の場合、is_published による絞り込みを行わない（未公開もプレビュー可能）", async (role) => {
    const phase = { id: 1, title: "未公開フェーズ", is_published: false, is_deleted: false };
    const mockClient = createMockSupabaseClient({ queryResult: { data: phase, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPhaseById(1, role);

    expect(result.data).toEqual(phase);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
  });
});

// ----------------------------------------------------------------
// fetchPublishedThemes（issue #68: admin / maintainer の未公開プレビュー）
// ----------------------------------------------------------------
describe("fetchPublishedThemes", () => {
  it("role未指定（member / お試しユーザー）の場合、is_published=true で絞り込む", async () => {
    const themes = [{ id: 1, name: "Theme 1", display_order: 1 }];
    const mockClient = createMockSupabaseClient({ queryResult: { data: themes, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPublishedThemes();

    expect(result.data).toEqual(themes);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
  });

  it.each([
    "admin",
    "maintainer",
  ] as const)("%s の場合、未公開テーマも含めて取得する（is_published絞り込みなし）", async (role) => {
    const themes = [
      { id: 1, name: "公開テーマ", display_order: 1, is_published: true },
      { id: 2, name: "未公開テーマ", display_order: 2, is_published: false },
    ];
    const mockClient = createMockSupabaseClient({ queryResult: { data: themes, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPublishedThemes(role);

    expect(result.data).toEqual(themes);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
  });

  it("DB エラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({ queryResult: { data: null, error: dbError } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPublishedThemes();

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

// ----------------------------------------------------------------
// fetchThemeById / fetchPhasesByThemeId / fetchWeekById / fetchContentById
// （issue #68: admin / maintainer の未公開プレビュー）
// ----------------------------------------------------------------
describe("fetchThemeById", () => {
  it("member の場合、is_published=true で絞り込む", async () => {
    const theme = { id: 1, name: "Theme 1", is_published: true };
    const mockClient = createMockSupabaseClient({ queryResult: { data: theme, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchThemeById(1, "member");

    expect(result.data).toEqual(theme);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
  });

  it("admin の場合、未公開テーマも取得できる", async () => {
    const theme = { id: 1, name: "未公開テーマ", is_published: false };
    const mockClient = createMockSupabaseClient({ queryResult: { data: theme, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchThemeById(1, "admin");

    expect(result.data).toEqual(theme);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
  });
});

describe("fetchPhasesByThemeId", () => {
  it("member の場合、is_published=true で絞り込む", async () => {
    const phases = [{ id: 1, name: "Phase 1", is_published: true }];
    const mockClient = createMockSupabaseClient({ queryResult: { data: phases, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchPhasesByThemeId(1, "member");

    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
  });

  it("maintainer の場合、未公開フェーズも取得できる", async () => {
    const phases = [{ id: 1, name: "未公開フェーズ", is_published: false }];
    const mockClient = createMockSupabaseClient({ queryResult: { data: phases, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPhasesByThemeId(1, "maintainer");

    expect(result.data).toEqual(phases);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
  });
});

describe("fetchWeekById", () => {
  it("member の場合、is_published=true で絞り込む", async () => {
    const week = { id: 1, name: "Week 1", is_published: true };
    const mockClient = createMockSupabaseClient({ queryResult: { data: week, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchWeekById(1, "member");

    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
  });

  it("admin の場合、未公開週も取得できる", async () => {
    const week = { id: 1, name: "未公開週", is_published: false };
    const mockClient = createMockSupabaseClient({ queryResult: { data: week, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchWeekById(1, "admin");

    expect(result.data).toEqual(week);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
  });
});

describe("fetchContentById", () => {
  it("member の場合、is_published=true で絞り込む", async () => {
    const content = { id: 1, title: "Content 1", is_published: true };
    const mockClient = createMockSupabaseClient({ queryResult: { data: content, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchContentById(1, "member");

    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
  });

  it("maintainer の場合、未公開コンテンツも取得できる", async () => {
    const content = { id: 1, title: "未公開コンテンツ", is_published: false };
    const mockClient = createMockSupabaseClient({ queryResult: { data: content, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentById(1, "maintainer");

    expect(result.data).toEqual(content);
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
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
    // is_published は許可リスト外のため select されない（DBレスポンスにも含まれない）。
    // 関数側で常に true を補うことを検証する。
    const summariesWithoutIsPublished = [
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
      queryResult: { data: summariesWithoutIsPublished, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentVisibilitySummariesByWeekIds([100]);

    expect(result.data).toEqual(
      summariesWithoutIsPublished.map((s) => ({ ...s, is_published: true }))
    );
    const builder = mockClient.from.mock.results[0].value;
    // service_role 経路は CLAUDE.md の許可リストのみを select する（is_published は含めない）
    expect(builder.select).toHaveBeenCalledWith(
      "id, title, content_type, display_order, is_open_to_trial, week_id"
    );
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
// fetchContentSummariesByWeekIds（issue #68: admin / maintainer の未公開プレビュー）
// ----------------------------------------------------------------
describe("fetchContentSummariesByWeekIds", () => {
  it("role未指定（member / お試しユーザー）の場合、service_role 経由（公開分のみ）で取得する", async () => {
    const summaries = [
      {
        id: 1,
        title: "公開コンテンツ",
        content_type: "video",
        display_order: 1,
        is_open_to_trial: true,
        is_published: true,
        week_id: 100,
      },
    ];
    const mockAdminClient = createMockSupabaseClient({
      queryResult: { data: summaries, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);

    const result = await fetchContentSummariesByWeekIds([100]);

    expect(result.data).toEqual(summaries);
    expect(createAdminSupabaseClient).toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([
    "admin",
    "maintainer",
  ] as const)("%s の場合、通常クライアント経由で未公開コンテンツも含めて取得する", async (role) => {
    const summaries = [
      {
        id: 1,
        title: "未公開コンテンツ",
        content_type: "exercise",
        display_order: 1,
        is_open_to_trial: false,
        is_published: false,
        week_id: 100,
      },
    ];
    const mockServerClient = createMockSupabaseClient({
      queryResult: { data: summaries, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);

    const result = await fetchContentSummariesByWeekIds([100], role);

    expect(result.data).toEqual(summaries);
    expect(createServerSupabaseClient).toHaveBeenCalled();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    const builder = mockServerClient.from.mock.results[0].value;
    expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
    // service_role を使わない経路でも is_deleted は必ず絞り込む
    // （admin / maintainer 向け SELECT RLS は is_deleted を見ないため）
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
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
        is_published: true,
        week_id: 100,
      },
      {
        id: 2,
        title: "Content B",
        content_type: "text",
        display_order: 2,
        is_open_to_trial: false,
        is_published: true,
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
      {
        id: 100,
        name: "Week 1",
        display_order: 1,
        contents: summaries,
      },
      { id: 101, name: "Week 2", display_order: 2, contents: [] },
    ]);
  });

  it("admin / maintainer の場合、未公開の週も通常クライアントで取得する（is_published絞り込みなし）", async () => {
    const weeks = [
      { id: 100, name: "Week 1", display_order: 1, is_published: true },
      { id: 101, name: "Week 2（未公開）", display_order: 2, is_published: false },
    ];
    const summaries = [
      {
        id: 1,
        title: "公開コンテンツ",
        content_type: "video",
        display_order: 1,
        is_open_to_trial: true,
        is_published: true,
        week_id: 100,
      },
      {
        id: 2,
        title: "未公開コンテンツ",
        content_type: "text",
        display_order: 1,
        is_open_to_trial: false,
        is_published: false,
        week_id: 101,
      },
    ];
    const mockServerClient = createMockSupabaseClient({
      tableResults: {
        learning_weeks: { data: weeks, error: null },
        learning_contents: { data: summaries, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);

    const result = await fetchWeeksWithContentsByPhaseId(1, "admin");

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { ...weeks[0], contents: [summaries[0]] },
      { ...weeks[1], contents: [summaries[1]] },
    ]);
    // 管理者向け経路は通常クライアントのみで完結する（service_role は使わない）
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
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

  it("コンテンツ自身と週・フェーズ・テーマの全階層を is_published=true / is_deleted=false で絞り込む（admin / maintainer のプレビュー中でも未公開・論理削除済みへの進捗・提出・AIレビューは常に不可）", async () => {
    const mockClient = createMockSupabaseClient({ queryResult: { data: { id: 1 }, error: null } });

    await isContentVisible(mockClient as never, 1);

    const builder = mockClient.from.mock.results[0].value;
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(builder.eq).toHaveBeenCalledWith("week.is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("week.is_deleted", false);
    expect(builder.eq).toHaveBeenCalledWith("week.phase.is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("week.phase.is_deleted", false);
    expect(builder.eq).toHaveBeenCalledWith("week.phase.theme.is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("week.phase.theme.is_deleted", false);
  });
});

// ----------------------------------------------------------------
// isContentFullyPublished（issue #68 PRレビュー対応: 親階層が未公開のケース）
// ----------------------------------------------------------------
describe("isContentFullyPublished", () => {
  const baseContent = {
    id: 1,
    is_published: true,
    week: {
      id: 100,
      is_published: true,
      is_deleted: false,
      phase: {
        id: 10,
        is_published: true,
        is_deleted: false,
        theme: { id: 1, is_published: true, is_deleted: false },
      },
    },
  } as unknown as Parameters<typeof isContentFullyPublished>[0];

  it("コンテンツ・週・フェーズ・テーマがすべて公開済み・未削除の場合、true を返す", () => {
    expect(isContentFullyPublished(baseContent)).toBe(true);
  });

  it("コンテンツ自身が未公開の場合、false を返す", () => {
    expect(isContentFullyPublished({ ...baseContent, is_published: false })).toBe(false);
  });

  it("親の週が未公開の場合、コンテンツ自身が公開済みでも false を返す", () => {
    const content = {
      ...baseContent,
      week: { ...baseContent.week, is_published: false },
    } as typeof baseContent;
    expect(isContentFullyPublished(content)).toBe(false);
  });

  it("親のフェーズ・テーマが未公開の場合も false を返す", () => {
    const week = baseContent.week as NonNullable<typeof baseContent.week>;
    const phase = week.phase as NonNullable<typeof week.phase>;

    const phaseUnpublished = {
      ...baseContent,
      week: { ...week, phase: { ...phase, is_published: false } },
    } as typeof baseContent;
    expect(isContentFullyPublished(phaseUnpublished)).toBe(false);

    const themeUnpublished = {
      ...baseContent,
      week: { ...week, phase: { ...phase, theme: { ...phase.theme, is_published: false } } },
    } as typeof baseContent;
    expect(isContentFullyPublished(themeUnpublished)).toBe(false);
  });

  it("週・フェーズ・テーマのいずれかが論理削除済みの場合、is_published が true でも false を返す（UIとAPIの不整合防止）", () => {
    const week = baseContent.week as NonNullable<typeof baseContent.week>;
    const phase = week.phase as NonNullable<typeof week.phase>;

    const weekDeleted = {
      ...baseContent,
      week: { ...week, is_deleted: true },
    } as typeof baseContent;
    expect(isContentFullyPublished(weekDeleted)).toBe(false);

    const phaseDeleted = {
      ...baseContent,
      week: { ...week, phase: { ...phase, is_deleted: true } },
    } as typeof baseContent;
    expect(isContentFullyPublished(phaseDeleted)).toBe(false);

    const themeDeleted = {
      ...baseContent,
      week: { ...week, phase: { ...phase, theme: { ...phase.theme, is_deleted: true } } },
    } as typeof baseContent;
    expect(isContentFullyPublished(themeDeleted)).toBe(false);
  });

  it("week / phase / theme が null の場合、false を返す（データ不整合時のフェイルクローズ）", () => {
    expect(isContentFullyPublished({ ...baseContent, week: null } as typeof baseContent)).toBe(
      false
    );
  });
});
