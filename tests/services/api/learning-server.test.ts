import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/supabase-server");

import {
  fetchContentById,
  fetchContentSummariesByPhaseId,
  fetchContentSummariesByPhaseIds,
  fetchContentVisibilitySummariesByPhaseIds,
  fetchHomeLearningData,
  fetchPhaseById,
  fetchPhasesByThemeId,
  fetchPhaseWithBreadcrumbById,
  fetchPublishedPhases,
  fetchPublishedThemes,
  fetchThemeById,
  fetchThemeNavigationIndex,
  fetchThemeProgressSummaries,
  fetchUserProgressByContentId,
  fetchUserProgressByContentIds,
  fetchVisibleContentForSubmission,
  isContentFullyPublished,
  isContentLockedForUser,
  isContentVisible,
  isPhaseHierarchyPublished,
} from "@/app/services/api/learning-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";

const dbError = { message: "db error", code: "PGRST001" };

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it.each(["admin", "maintainer"] as const)(
    "%s の場合、is_published による絞り込みを行わない（未公開もプレビュー可能）",
    async (role) => {
      const phase = { id: 1, title: "未公開フェーズ", is_published: false, is_deleted: false };
      const mockClient = createMockSupabaseClient({ queryResult: { data: phase, error: null } });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

      const result = await fetchPhaseById(1, role);

      expect(result.data).toEqual(phase);
      const builder = mockClient.from.mock.results[0].value;
      expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
    }
  );
});

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

  it.each(["admin", "maintainer"] as const)(
    "%s の場合、未公開テーマも含めて取得する（is_published絞り込みなし）",
    async (role) => {
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
    }
  );

  it("DB エラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({ queryResult: { data: null, error: dbError } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPublishedThemes();

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

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

describe("fetchPhaseWithBreadcrumbById", () => {
  it("member の場合、is_published=true・is_deleted=false で絞り込む", async () => {
    const phase = { id: 1, name: "Phase 1", is_published: true };
    const mockClient = createMockSupabaseClient({ queryResult: { data: phase, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    await fetchPhaseWithBreadcrumbById(1, "member");

    const builder = mockClient.from.mock.results[0].value;
    expect(mockClient.from).toHaveBeenCalledWith("learning_phases");
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
  });

  it("admin の場合、未公開フェーズも取得できる", async () => {
    const phase = { id: 1, name: "未公開フェーズ", is_published: false };
    const mockClient = createMockSupabaseClient({ queryResult: { data: phase, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchPhaseWithBreadcrumbById(1, "admin");

    expect(result.data).toEqual(phase);
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
    expect(builder.maybeSingle).toHaveBeenCalled();
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

  it("0行（RLS不可視・未存在）の場合、エラーログせず data: null を返す", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockClient = createMockSupabaseClient({ queryResult: { data: null, error: null } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentById(999, "member");

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("fetchThemeProgressSummaries", () => {
  /**
   * Mock client returning per-table results; an array for progress is consumed one entry per
   * user_progress call (paging tests).
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
          name: "Phase 1",
          display_order: 1,
          contents: [
            {
              id: 1000,
              title: "C1000",
              content_type: "text",
              display_order: 1,
              phase_id: 10,
            },
            {
              id: 1001,
              title: "C1001",
              content_type: "text",
              display_order: 2,
              phase_id: 10,
            },
            {
              id: 1002,
              title: "C1002",
              content_type: "text",
              display_order: 3,
              phase_id: 10,
            },
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

  it("コンテンツが1件もない場合、進捗の結果を使わず完了数0を返す（進捗はテーマ取得と並列に始まる）", async () => {
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
    expect(mockClient.from).toHaveBeenCalledWith("learning_themes");
    expect(mockClient.from).toHaveBeenCalledWith("user_progress");
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
            contents: Array.from({ length: contentCount }, (_, i) => ({ id: i + 1 })),
          },
        ],
      },
    ];
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
    expect(mockClient.from).toHaveBeenCalledTimes(3);
  });
});

describe("fetchHomeLearningData", () => {
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

  it("1回のツリー取得と進捗ページングからサマリーと続きから学習入力を返す", async () => {
    const themes = [
      {
        id: 1,
        name: "Theme 1",
        display_order: 1,
        phases: [
          {
            id: 10,
            name: "Phase 1",
            display_order: 1,
            contents: [
              {
                id: 1000,
                title: "First",
                content_type: "text",
                display_order: 1,
                phase_id: 10,
              },
              {
                id: 1001,
                title: "Second",
                content_type: "text",
                display_order: 2,
                phase_id: 10,
              },
            ],
          },
        ],
      },
    ];
    const mockClient = createPerTableMockClient({
      themes: { data: themes, error: null },
      progress: {
        data: [{ content_id: 1000, completed_at: "2026-01-01T00:00:00.000Z" }],
        error: null,
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchHomeLearningData(1);

    expect(result.error).toBeNull();
    expect(result.data?.summaries).toEqual([
      {
        theme: { id: 1, name: "Theme 1", display_order: 1 },
        totalContents: 2,
        completedContents: 1,
      },
    ]);
    expect(result.data?.orderedContents.map((c) => c.id)).toEqual([1000, 1001]);
    expect(result.data?.completedContentIds.has(1000)).toBe(true);
    expect(result.data?.completedAtByContentId.get(1000)).toBe(
      Date.parse("2026-01-01T00:00:00.000Z")
    );
    expect(result.data?.lastViewedAtByContentId.size).toBe(0);
    // Themes + completed progress page + last_viewed page (#396).
    expect(mockClient.from).toHaveBeenCalledTimes(3);
  });
});

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

describe("fetchUserProgressByContentId", () => {
  it("進捗が存在し完了している場合、isCompleted: true と retryStartedAt を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: {
        data: { is_completed: true, retry_started_at: "2026-10-01T12:00:00.000Z" },
        error: null,
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentId(1, 10);

    expect(result.isCompleted).toBe(true);
    expect(result.retryStartedAt).toBe("2026-10-01T12:00:00.000Z");
    expect(result.error).toBeNull();
  });

  it("進捗レコードが存在しない場合、isCompleted: false と retryStartedAt: null を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentId(1, 10);

    expect(result.isCompleted).toBe(false);
    expect(result.retryStartedAt).toBeNull();
    expect(result.error).toBeNull();
  });

  it("DB エラー時、isCompleted: false とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchUserProgressByContentId(1, 10);

    expect(result.isCompleted).toBe(false);
    expect(result.retryStartedAt).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

describe("fetchContentVisibilitySummariesByPhaseIds", () => {
  it("phaseIds が空配列の場合、Supabase を呼ばずに空配列を返す", async () => {
    const mockClient = createMockSupabaseClient();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentVisibilitySummariesByPhaseIds([]);

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it("正常時、service_role クライアントでコンテンツサマリーを返す（お試し非公開分も含む）", async () => {
    // is_published is outside the select allowlist, so the DB response lacks it; the function must
    // always fill in true.
    const summariesWithoutIsPublished = [
      {
        id: 1,
        title: "公開コンテンツ",
        content_type: "video",
        display_order: 1,
        is_open_to_trial: true,
        phase_id: 100,
      },
      {
        id: 2,
        title: "お試し非公開コンテンツ",
        content_type: "exercise",
        display_order: 2,
        is_open_to_trial: false,
        phase_id: 100,
      },
    ];
    const mockClient = createMockSupabaseClient({
      queryResult: { data: summariesWithoutIsPublished, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentVisibilitySummariesByPhaseIds([100]);

    expect(result.data).toEqual(
      summariesWithoutIsPublished.map((s) => ({ ...s, is_published: true }))
    );
    const builder = mockClient.from.mock.results[0].value;
    // The service_role path selects only the AGENTS.md allowlist (no is_published).
    expect(builder.select).toHaveBeenCalledWith(
      "id, title, content_type, display_order, is_open_to_trial, phase_id"
    );
    expect(result.error).toBeNull();
  });

  it("DB エラー時、data: null とエラーを返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockClient as never);

    const result = await fetchContentVisibilitySummariesByPhaseIds([100]);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

describe("fetchContentSummariesByPhaseIds", () => {
  it("role未指定（member / お試しユーザー）の場合、service_role 経由（公開分のみ）で取得する", async () => {
    const summaries = [
      {
        id: 1,
        title: "公開コンテンツ",
        content_type: "video",
        display_order: 1,
        is_open_to_trial: true,
        is_published: true,
        phase_id: 100,
      },
    ];
    const mockAdminClient = createMockSupabaseClient({
      queryResult: { data: summaries, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);

    const result = await fetchContentSummariesByPhaseIds([100]);

    expect(result.data).toEqual(summaries);
    expect(createAdminSupabaseClient).toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(["admin", "maintainer"] as const)(
    "%s の場合、通常クライアント経由で未公開コンテンツも含めて取得する",
    async (role) => {
      const summaries = [
        {
          id: 1,
          title: "未公開コンテンツ",
          content_type: "exercise",
          display_order: 1,
          is_open_to_trial: false,
          is_published: false,
          phase_id: 100,
        },
      ];
      const mockServerClient = createMockSupabaseClient({
        queryResult: { data: summaries, error: null },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);

      const result = await fetchContentSummariesByPhaseIds([100], role);

      expect(result.data).toEqual(summaries);
      expect(createServerSupabaseClient).toHaveBeenCalled();
      expect(createAdminSupabaseClient).not.toHaveBeenCalled();
      const builder = mockServerClient.from.mock.results[0].value;
      expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
      // Even without service_role, is_deleted must be filtered (admin/maintainer SELECT RLS ignores
      // is_deleted).
      expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
      expect(builder.order).toHaveBeenCalledWith("display_order");
      expect(builder.order).toHaveBeenCalledWith("id");
      expect(builder.range).toHaveBeenCalledWith(0, 999);
    }
  );

  it("PostgREST 上限を超える場合、range で次ページを結合して全件返す", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
      title: `他フェーズ${index + 1}`,
      content_type: "text",
      display_order: 1,
      is_open_to_trial: true,
      is_published: true,
      phase_id: 20,
    }));
    const secondPage = [
      {
        id: 2001,
        title: "現在のフェーズ",
        content_type: "text",
        display_order: 1,
        is_open_to_trial: true,
        is_published: true,
        phase_id: 10,
      },
    ];
    const mockAdminClient = createMockSupabaseClient({
      tableResults: {
        learning_contents: [
          { data: firstPage, error: null },
          { data: secondPage, error: null },
        ],
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);

    const result = await fetchContentSummariesByPhaseIds([10, 20]);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1001);
    expect(result.data?.[1000]).toEqual({ ...secondPage[0], is_published: true });
    expect(mockAdminClient.from).toHaveBeenCalledTimes(2);
    expect(mockAdminClient.from.mock.results[0].value.range).toHaveBeenCalledWith(0, 999);
    expect(mockAdminClient.from.mock.results[1].value.range).toHaveBeenCalledWith(1000, 1999);
  });
});

describe("fetchThemeNavigationIndex", () => {
  const phases = [
    { id: 10, name: "フェーズ1", display_order: 2 },
    { id: 20, name: "フェーズ2", display_order: 1 },
  ];
  const contents = [
    {
      id: 1,
      title: "フェーズ1-先",
      content_type: "video",
      display_order: 1,
      is_open_to_trial: true,
      is_published: true,
      phase_id: 10,
    },
    {
      id: 2,
      title: "フェーズ1-後",
      content_type: "text",
      display_order: 2,
      is_open_to_trial: false,
      is_published: true,
      phase_id: 10,
    },
    {
      id: 3,
      title: "フェーズ2",
      content_type: "slide",
      display_order: 1,
      is_open_to_trial: true,
      is_published: true,
      phase_id: 20,
    },
  ];

  const mockClients = (
    options: {
      phaseResult?: { data: unknown; error: unknown };
      contentResult?: { data: unknown; error: unknown };
    } = {}
  ) => {
    const mockServerClient = createMockSupabaseClient({
      queryResult: options.phaseResult ?? { data: phases, error: null },
    });
    const mockAdminClient = createMockSupabaseClient({
      queryResult: options.contentResult ?? { data: contents, error: null },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);
    return { mockServerClient, mockAdminClient };
  };

  it("member: フェーズクエリは learning_phases を直接引き、theme / 公開 / 未削除のフィルタが課される", async () => {
    const { mockServerClient } = mockClients();

    await fetchThemeNavigationIndex(1, 10, "member");

    expect(mockServerClient.from).toHaveBeenCalledWith("learning_phases");
    const phaseBuilder = mockServerClient.from.mock.results[0].value;
    expect(phaseBuilder.select.mock.calls[0][0]).not.toContain("!inner");
    expect(phaseBuilder.eq).toHaveBeenCalledWith("theme_id", 1);
    expect(phaseBuilder.eq).toHaveBeenCalledWith("is_published", true);
    expect(phaseBuilder.eq).toHaveBeenCalledWith("is_deleted", false);
  });

  it("member: コンテンツ側は service_role 経由で、許可リストの列と全フェーズ＋現在のフェーズを in() する", async () => {
    const { mockAdminClient } = mockClients();

    await fetchThemeNavigationIndex(1, 10, "member");

    expect(createAdminSupabaseClient).toHaveBeenCalled();
    const contentBuilder = mockAdminClient.from.mock.results[0].value;
    expect(contentBuilder.select).toHaveBeenCalledWith(
      "id, title, content_type, display_order, is_open_to_trial, phase_id"
    );
    expect(contentBuilder.in).toHaveBeenCalledWith("phase_id", [10, 20]);
    expect(contentBuilder.eq).toHaveBeenCalledWith("is_published", true);
    expect(contentBuilder.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(contentBuilder.order).toHaveBeenCalledWith("display_order");
    expect(contentBuilder.order).toHaveBeenCalledWith("id");
    expect(contentBuilder.range).toHaveBeenCalledWith(0, 999);
  });

  it("コンテンツが1000行で切り詰められても、次ページの現在のフェーズが currentPhaseContents に残る", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: 1000 + index,
      title: `他フェーズ${index}`,
      content_type: "text",
      display_order: 1,
      is_open_to_trial: true,
      is_published: true,
      phase_id: 20,
    }));
    const currentPhasePage = contents.filter((content) => content.phase_id === 10);
    const mockServerClient = createMockSupabaseClient({
      queryResult: { data: phases, error: null },
    });
    const mockAdminClient = createMockSupabaseClient({
      tableResults: {
        learning_contents: [
          { data: firstPage, error: null },
          { data: currentPhasePage, error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);

    const result = await fetchThemeNavigationIndex(1, 10, "member");

    expect(result.error).toBeNull();
    expect(result.data?.currentPhaseContents.map((c) => c.id)).toEqual([1, 2]);
    expect(result.data?.orderedContents.some((c) => c.id === 1)).toBe(true);
    expect(createAdminSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mockAdminClient.from).toHaveBeenCalledTimes(2);
  });

  it.each(["admin", "maintainer"] as const)(
    "%s: is_published 系のフィルタが付かず、service_role も使わない。未公開が通し列に含まれる",
    async (role) => {
      const unpublished = [
        {
          id: 9,
          title: "未公開",
          content_type: "text",
          display_order: 1,
          is_open_to_trial: false,
          is_published: false,
          phase_id: 10,
        },
      ];
      const mockServerClient = createMockSupabaseClient({
        tableResults: {
          learning_phases: { data: phases, error: null },
          learning_contents: { data: unpublished, error: null },
        },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);

      const result = await fetchThemeNavigationIndex(1, 10, role);

      expect(createAdminSupabaseClient).not.toHaveBeenCalled();
      const phaseBuilder = mockServerClient.from.mock.results[0].value;
      expect(phaseBuilder.eq).not.toHaveBeenCalledWith("is_published", true);
      expect(result.data?.orderedContents.map((c) => c.id)).toEqual([9]);
    }
  );

  it("orderedContents は階層順、currentPhaseContents は現在のフェーズのみ・display_order 順", async () => {
    mockClients();

    const result = await fetchThemeNavigationIndex(1, 10, "member");

    expect(result.error).toBeNull();
    expect(result.data?.orderedContents.map((c) => c.id)).toEqual([3, 1, 2]);
    expect(result.data?.currentPhaseContents.map((c) => c.id)).toEqual([1, 2]);
  });

  it("現在のフェーズがテーマ内フェーズリストに無い場合、in() に現在のフェーズが含まれ currentPhaseContents は埋まる", async () => {
    const extraContents = [
      ...contents,
      {
        id: 99,
        title: "現在のフェーズのみ",
        content_type: "text",
        display_order: 1,
        is_open_to_trial: true,
        is_published: true,
        phase_id: 99,
      },
    ];
    const { mockAdminClient } = mockClients({
      contentResult: { data: extraContents, error: null },
    });

    const result = await fetchThemeNavigationIndex(1, 99, "member");

    const contentBuilder = mockAdminClient.from.mock.results[0].value;
    expect(contentBuilder.in).toHaveBeenCalledWith("phase_id", [10, 20, 99]);
    expect(result.data?.currentPhaseContents.map((c) => c.id)).toEqual([99]);
    expect(result.data?.orderedContents.map((c) => c.id)).toEqual([3, 1, 2]);
  });

  it("フェーズクエリがDBエラーでも error を返さず、currentPhaseContents は埋まり orderedContents は空", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error");
    const { mockAdminClient } = mockClients({ phaseResult: { data: null, error: dbError } });

    const result = await fetchThemeNavigationIndex(1, 10, "member");

    expect(result.error).toBeNull();
    expect(result.data?.orderedContents).toEqual([]);
    expect(result.data?.currentPhaseContents.map((c) => c.id)).toEqual([1, 2]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "テーマ内ナビ用フェーズ一覧取得エラー:",
      dbError.message
    );
    const contentBuilder = mockAdminClient.from.mock.results[0].value;
    expect(contentBuilder.in).toHaveBeenCalledWith("phase_id", [10]);
  });

  it("コンテンツクエリがDBエラーの場合、{ data: null, error } を返す", async () => {
    mockClients({ contentResult: { data: null, error: dbError } });

    const result = await fetchThemeNavigationIndex(1, 10, "member");

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });

  it("現在のフェーズが既にフェーズリストにある場合、in() に重複が渡らない", async () => {
    const { mockAdminClient } = mockClients();

    await fetchThemeNavigationIndex(1, 10, "member");

    const contentBuilder = mockAdminClient.from.mock.results[0].value;
    const phaseIds = contentBuilder.in.mock.calls[0][1] as number[];
    expect(phaseIds).toEqual([10, 20]);
    expect(new Set(phaseIds).size).toBe(phaseIds.length);
  });

  it("trial 相当で is_open_to_trial = false のコンテンツも orderedContents に含まれる", async () => {
    mockClients();

    const result = await fetchThemeNavigationIndex(1, 10, "member");

    expect(result.data?.orderedContents.some((c) => c.id === 2)).toBe(true);
  });
});

describe("fetchContentSummariesByPhaseId", () => {
  const summary = (id: number, displayOrder: number | null, isPublished = true) => ({
    id,
    title: `Content ${id}`,
    content_type: "text",
    display_order: displayOrder,
    is_open_to_trial: true,
    is_published: isPublished,
    phase_id: 1,
  });

  it("member: service_role 経由で単一フェーズを in() し、display_order 順に返す", async () => {
    const summaries = [summary(2, 2), summary(1, 1)];
    const mockAdminClient = createMockSupabaseClient({
      queryResult: { data: summaries, error: null },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);

    const result = await fetchContentSummariesByPhaseId(1);

    expect(result.error).toBeNull();
    expect(result.data?.map((c) => c.id)).toEqual([1, 2]);
    const builder = mockAdminClient.from.mock.results[0].value;
    expect(builder.in).toHaveBeenCalledWith("phase_id", [1]);
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("display_order 同値のコンテンツは id でタイブレークし、ナビと同じ compareGroupLevel 順になる（display_order が null は最後）", async () => {
    const mockAdminClient = createMockSupabaseClient({
      queryResult: {
        data: [summary(30, null), summary(20, 1), summary(10, 1)],
        error: null,
      },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);

    const result = await fetchContentSummariesByPhaseId(1);

    expect(result.data?.map((c) => c.id)).toEqual([10, 20, 30]);
  });

  it.each(["admin", "maintainer"] as const)(
    "%s の場合、未公開コンテンツも通常クライアントで取得する（is_published絞り込みなし）",
    async (role) => {
      const summaries = [summary(1, 1), summary(2, 1, false)];
      const mockServerClient = createMockSupabaseClient({
        tableResults: { learning_contents: { data: summaries, error: null } },
      });
      vi.mocked(createServerSupabaseClient).mockResolvedValue(mockServerClient as never);

      const result = await fetchContentSummariesByPhaseId(1, role);

      expect(result.error).toBeNull();
      expect(result.data).toEqual(summaries);
      const builder = mockServerClient.from.mock.results[0].value;
      expect(builder.eq).not.toHaveBeenCalledWith("is_published", true);
      expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
      expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    }
  );

  it("取得エラー時、data: null とエラーを返す", async () => {
    const mockAdminClient = createMockSupabaseClient({
      queryResult: { data: null, error: dbError },
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(mockAdminClient as never);

    const result = await fetchContentSummariesByPhaseId(1);

    expect(result.data).toBeNull();
    expect(result.error).toEqual(dbError);
  });
});

describe("isContentLockedForUser", () => {
  it("trial かつ お試し非公開の場合、true を返す", () => {
    expect(isContentLockedForUser("trial", false)).toBe(true);
  });

  it("trial でも お試し公開の場合、false を返す", () => {
    expect(isContentLockedForUser("trial", true)).toBe(false);
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

describe("isContentVisible", () => {
  it("対象コンテンツが取得できる場合、true を返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { id: 1 }, error: null },
    });

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

  it("コンテンツ自身とフェーズ・テーマの全階層を is_published=true / is_deleted=false で絞り込む（admin / maintainer のプレビュー中でも未公開・論理削除済みへの進捗・提出・AIレビューは常に不可）", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: { data: { id: 1 }, error: null },
    });

    await isContentVisible(mockClient as never, 1);

    const builder = mockClient.from.mock.results[0].value;
    expect(builder.select).toHaveBeenCalledWith(
      "id, phase:learning_phases!inner(theme:learning_themes!inner(id))"
    );
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(builder.eq).toHaveBeenCalledWith("phase.is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("phase.is_deleted", false);
    expect(builder.eq).toHaveBeenCalledWith("phase.theme.is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("phase.theme.is_deleted", false);
  });
});

describe("fetchVisibleContentForSubmission", () => {
  it("可視なら提出構成の解決に使う列だけ返す", async () => {
    const mockClient = createMockSupabaseClient({
      queryResult: {
        data: {
          code_language: "javascript",
          submission_file_slots: null,
          starter_files: null,
        },
        error: null,
      },
    });

    const result = await fetchVisibleContentForSubmission(mockClient as never, 1);

    expect(result).toEqual({
      code_language: "javascript",
      submission_file_slots: null,
      starter_files: null,
    });
    const builder = mockClient.from.mock.results[0].value;
    expect(builder.select).toHaveBeenCalledWith(
      "code_language, submission_file_slots, starter_files, phase:learning_phases!inner(theme:learning_themes!inner(id))"
    );
    expect(builder.eq).toHaveBeenCalledWith("is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("is_deleted", false);
    expect(builder.eq).toHaveBeenCalledWith("phase.is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("phase.is_deleted", false);
    expect(builder.eq).toHaveBeenCalledWith("phase.theme.is_published", true);
    expect(builder.eq).toHaveBeenCalledWith("phase.theme.is_deleted", false);
  });

  it("不可視なら null を返す", async () => {
    const mockClient = createMockSupabaseClient({ queryResult: { data: null, error: null } });

    await expect(fetchVisibleContentForSubmission(mockClient as never, 999)).resolves.toBeNull();
  });
});

describe("isContentFullyPublished", () => {
  const baseContent = {
    id: 1,
    is_published: true,
    phase: {
      id: 10,
      is_published: true,
      is_deleted: false,
      theme: { id: 1, is_published: true, is_deleted: false },
    },
  } as unknown as Parameters<typeof isContentFullyPublished>[0];

  it("コンテンツ・フェーズ・テーマがすべて公開済み・未削除の場合、true を返す", () => {
    expect(isContentFullyPublished(baseContent)).toBe(true);
  });

  it("コンテンツ自身が未公開の場合、false を返す", () => {
    expect(isContentFullyPublished({ ...baseContent, is_published: false })).toBe(false);
  });

  it("親のフェーズ・テーマが未公開の場合、コンテンツ自身が公開済みでも false を返す", () => {
    const phase = baseContent.phase as NonNullable<typeof baseContent.phase>;

    const phaseUnpublished = {
      ...baseContent,
      phase: { ...phase, is_published: false },
    } as typeof baseContent;
    expect(isContentFullyPublished(phaseUnpublished)).toBe(false);

    const themeUnpublished = {
      ...baseContent,
      phase: { ...phase, theme: { ...phase.theme, is_published: false } },
    } as typeof baseContent;
    expect(isContentFullyPublished(themeUnpublished)).toBe(false);
  });

  it("フェーズ・テーマのいずれかが論理削除済みの場合、is_published が true でも false を返す（UIとAPIの不整合防止）", () => {
    const phase = baseContent.phase as NonNullable<typeof baseContent.phase>;

    const phaseDeleted = {
      ...baseContent,
      phase: { ...phase, is_deleted: true },
    } as typeof baseContent;
    expect(isContentFullyPublished(phaseDeleted)).toBe(false);

    const themeDeleted = {
      ...baseContent,
      phase: { ...phase, theme: { ...phase.theme, is_deleted: true } },
    } as typeof baseContent;
    expect(isContentFullyPublished(themeDeleted)).toBe(false);
  });

  it("phase / theme が null の場合、false を返す（データ不整合時のフェイルクローズ）", () => {
    expect(isContentFullyPublished({ ...baseContent, phase: null } as typeof baseContent)).toBe(
      false
    );
  });
});

describe("isPhaseHierarchyPublished", () => {
  const publishedPhase = {
    id: 10,
    theme_id: 1,
    name: "フェーズ1",
    is_published: true,
    is_deleted: false,
    theme: { id: 1, name: "GAS", is_published: true, is_deleted: false },
  };

  it("フェーズ・テーマがすべて公開済み・未削除の場合、true を返す", () => {
    expect(isPhaseHierarchyPublished(publishedPhase)).toBe(true);
  });

  it("フェーズ自身が未公開・論理削除の場合、false を返す", () => {
    expect(isPhaseHierarchyPublished({ ...publishedPhase, is_published: false })).toBe(false);
    expect(isPhaseHierarchyPublished({ ...publishedPhase, is_deleted: true })).toBe(false);
  });

  it("テーマだけ未公開・論理削除の場合、false を返す", () => {
    for (const theme of [
      { ...publishedPhase.theme, is_published: false },
      { ...publishedPhase.theme, is_deleted: true },
    ]) {
      expect(isPhaseHierarchyPublished({ ...publishedPhase, theme })).toBe(false);
    }
  });

  it("RLS でテーマの埋め込みが null になった場合、false を返す", () => {
    expect(isPhaseHierarchyPublished({ ...publishedPhase, theme: null })).toBe(false);
  });

  it("フェーズ自体が null / undefined の場合、false を返す", () => {
    expect(isPhaseHierarchyPublished(null)).toBe(false);
    expect(isPhaseHierarchyPublished(undefined)).toBe(false);
  });
});
