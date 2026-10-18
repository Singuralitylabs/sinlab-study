import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, type QueryResult } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@/app/services/notifications/user-emails", () => ({
  scheduleCertificateIssuedEmail: vi.fn(),
}));

import {
  fetchCertificateCountsByUser,
  fetchMyCertificateById,
  fetchRecentCertificate,
  issueCertificateIfEligible,
  issueMissingCertificates,
  maybeIssueCertificate,
  resolveAiReviewThemeNotice,
  resolveProgressThemeNotice,
} from "@/app/services/api/certificates-server";
import {
  fetchThemeProgressSummaries,
  fetchThemeProgressSummary,
} from "@/app/services/api/learning-server";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/app/services/api/supabase-server";
import { scheduleCertificateIssuedEmail } from "@/app/services/notifications/user-emails";

const THEME = { id: 5, name: "GAS 学習（基礎編）" };
const params = {
  userId: 2,
  userStatus: "active" as const,
  userRole: "member" as const,
  contentId: 10,
};

const summary = (totalContents: number, completedContents: number) => ({
  theme: THEME,
  totalContents,
  completedContents,
});

function mockSummaries(summaries: ReturnType<typeof summary>[]) {
  vi.mocked(fetchThemeProgressSummaries).mockResolvedValue({
    data: summaries as never,
    error: null,
  });
  vi.mocked(fetchThemeProgressSummary).mockImplementation(async (_userId, themeId) => {
    const match = summaries.find((item) => item.theme.id === themeId) ?? null;
    return { data: match as never, error: null };
  });
}

function mockUserClient(tableResults: Record<string, QueryResult | QueryResult[]> = {}) {
  const client = createMockSupabaseClient({
    tableResults: {
      learning_contents: { data: { phase: { theme_id: THEME.id } }, error: null },
      ...tableResults,
    },
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
  return client;
}

function mockAdminClient(tableResults: Record<string, QueryResult | QueryResult[]>) {
  const client = createMockSupabaseClient({
    tableResults: { users: { data: { display_name: "山田 太郎" }, error: null }, ...tableResults },
  });
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);
  return client;
}

const inserted = {
  data: { id: 31, certificate_no: "SS-202610-ABC123", theme_name: THEME.name },
  error: null,
};

function certificateInserts(client: ReturnType<typeof mockAdminClient>) {
  return client.from.mock.calls
    .map(([table], i) => ({ table, builder: client.from.mock.results[i].value }))
    .filter(({ table }) => table === "certificates")
    .map(({ builder }) => builder as { insert: { mock: { calls: unknown[][] } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockUserClient();
  mockSummaries([summary(3, 3)]);
});

describe("issueCertificateIfEligible - 発行条件", () => {
  it("公開コンテンツがすべて完了した active member に発行し、メールを予約する", async () => {
    const admin = mockAdminClient({ certificates: inserted });

    const result = await issueCertificateIfEligible(params);

    expect(result).toEqual(inserted.data);
    const [builder] = certificateInserts(admin);
    expect(builder.insert.mock.calls[0][0]).toEqual({
      user_id: 2,
      theme_id: 5,
      certificate_no: expect.stringMatching(/^SS-\d{6}-[0-9A-Z]{6}$/),
      recipient_name: "山田 太郎",
      theme_name: THEME.name,
    });
    expect(scheduleCertificateIssuedEmail).toHaveBeenCalledWith({
      userId: 2,
      certificateId: 31,
      themeName: THEME.name,
      certificateNo: "SS-202610-ABC123",
    });
  });

  it("そのテーマが発行済みなら、集計も INSERT もせず早期に終える", async () => {
    mockUserClient({
      certificates: {
        data: {
          id: 31,
          theme_id: THEME.id,
          certificate_no: "SS-202610-ABC123",
          theme_name: THEME.name,
        },
        error: null,
      },
    });

    expect(await issueCertificateIfEligible(params)).toBeNull();
    expect(fetchThemeProgressSummary).not.toHaveBeenCalled();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("発行済みの確認に失敗しても発行判定は続ける（UNIQUE が冪等性を守る）", async () => {
    mockUserClient({ certificates: { data: null, error: { message: "read failed" } } });
    mockAdminClient({ certificates: inserted });

    expect(await issueCertificateIfEligible(params)).toEqual(inserted.data);
  });

  it("受講者名が空（空白のみ）なら、名前なしの修了証を作らず発行を見送る", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const admin = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: "  " }, error: null },
    });

    expect(await issueCertificateIfEligible(params)).toBeNull();
    expect(certificateInserts(admin)).toHaveLength(0);
    expect(scheduleCertificateIssuedEmail).not.toHaveBeenCalled();
  });

  it("未完了が1件でもあれば発行しない（admin クライアントも取得しない）", async () => {
    mockSummaries([summary(3, 2)]);
    mockAdminClient({ certificates: inserted });

    expect(await issueCertificateIfEligible(params)).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("分母は fetchThemeProgressSummary の集計（未公開を含まない）をそのまま使う", async () => {
    // Unpublished contents are already excluded from totalContents by that function, so 2/2
    // completes even if an unpublished third content is incomplete.
    mockSummaries([summary(2, 2)]);
    mockAdminClient({ certificates: inserted });

    expect(await issueCertificateIfEligible(params)).not.toBeNull();
    expect(fetchThemeProgressSummary).toHaveBeenCalledWith(2, THEME.id);
  });

  it("公開コンテンツが0件のテーマには発行しない", async () => {
    mockSummaries([summary(0, 0)]);

    expect(await issueCertificateIfEligible(params)).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([
    ["trial", "member"],
    ["active", "admin"],
    ["active", "maintainer"],
  ] as const)("status=%s role=%s には発行しない", async (userStatus, userRole) => {
    const result = await issueCertificateIfEligible({ ...params, userStatus, userRole });

    expect(result).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(fetchThemeProgressSummary).not.toHaveBeenCalled();
  });

  it("コンテンツが属するテーマ以外の完了では発行しない", async () => {
    mockUserClient({
      learning_contents: { data: { phase: { theme_id: 99 } }, error: null },
    });

    expect(await issueCertificateIfEligible(params)).toBeNull();
  });
});

describe("issueCertificateIfEligible - 冪等性・失敗時", () => {
  it("(user_id, theme_id) の UNIQUE 違反は既存行を返し、再試行もメールもしない", async () => {
    const existing = {
      id: 31,
      theme_id: THEME.id,
      certificate_no: "SS-202610-ABC123",
      theme_name: THEME.name,
    };
    mockUserClient({
      learning_contents: { data: { phase: { theme_id: THEME.id } }, error: null },
      certificates: [
        { data: null, error: null },
        { data: existing, error: null },
      ],
    });
    const admin = mockAdminClient({
      certificates: {
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "certificates_user_theme_unique"',
        },
      },
    });

    expect(await issueCertificateIfEligible(params)).toEqual(existing);
    expect(certificateInserts(admin)).toHaveLength(1);
    expect(scheduleCertificateIssuedEmail).not.toHaveBeenCalled();
  });

  it("UNIQUE 後の本人セッション再取得が失敗しても admin で既存行を返す", async () => {
    const existing = {
      id: 31,
      theme_id: THEME.id,
      certificate_no: "SS-202610-ABC123",
      theme_name: THEME.name,
    };
    mockUserClient({
      learning_contents: { data: { phase: { theme_id: THEME.id } }, error: null },
      certificates: [
        { data: null, error: null },
        { data: null, error: { message: "read failed" } },
      ],
    });
    const admin = mockAdminClient({
      certificates: [
        {
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "certificates_user_theme_unique"',
          },
        },
        { data: existing, error: null },
      ],
    });

    expect(await issueCertificateIfEligible(params)).toEqual(existing);
    expect(
      certificateInserts(admin).filter((builder) => builder.insert.mock.calls.length > 0)
    ).toHaveLength(1);
    expect(scheduleCertificateIssuedEmail).not.toHaveBeenCalled();
  });

  it("証明番号の衝突だけは番号を作り直して再試行する", async () => {
    const admin = mockAdminClient({
      certificates: [
        {
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "certificates_certificate_no_unique"',
          },
        },
        inserted,
      ],
    });

    expect(await issueCertificateIfEligible(params)).toEqual(inserted.data);
    expect(certificateInserts(admin)).toHaveLength(2);
    expect(scheduleCertificateIssuedEmail).toHaveBeenCalledTimes(1);
  });

  it("INSERT が他の DB エラーでも例外にせず null を返す（進捗 API のレスポンスを変えない）", async () => {
    mockAdminClient({ certificates: { data: null, error: { code: "XX000", message: "boom" } } });

    await expect(issueCertificateIfEligible(params)).resolves.toBeNull();
    expect(scheduleCertificateIssuedEmail).not.toHaveBeenCalled();
  });

  it("admin クライアント生成失敗は握りつぶして null を返す", async () => {
    vi.mocked(createAdminSupabaseClient).mockRejectedValue(new Error("no service role key"));
    await expect(issueCertificateIfEligible(params)).resolves.toBeNull();
  });

  it("メール予約が throw しても発行結果は返す", async () => {
    mockAdminClient({ certificates: inserted });
    vi.mocked(scheduleCertificateIssuedEmail).mockImplementationOnce(() => {
      throw new Error("mail down");
    });
    await expect(issueCertificateIfEligible(params)).resolves.toEqual(inserted.data);
  });

  it("集計の取得に失敗したら発行しない", async () => {
    vi.mocked(fetchThemeProgressSummary).mockResolvedValue({
      data: null,
      error: { message: "x" } as never,
    });

    expect(await issueCertificateIfEligible(params)).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("issueMissingCertificates（既に完了済みのテーマの遡及発行）", () => {
  const eligible = { userId: 2, userStatus: "active" as const, userRole: "member" as const };
  const done = (id: number) => ({ ...summary(3, 3), theme: { id, name: `テーマ${id}` } });

  it("完了済みで未発行のテーマだけに発行する（発行済み・未完了は対象外）", async () => {
    const admin = mockAdminClient({ certificates: inserted });

    const result = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1), done(2), summary(3, 1) as never] as never,
      issuedThemeIds: new Set([1]),
    });

    expect(result).toEqual({ issued: [inserted.data], blockedByMissingName: false });
    const builders = certificateInserts(admin);
    expect(builders).toHaveLength(1);
    expect(builders[0].insert.mock.calls[0][0]).toMatchObject({
      user_id: 2,
      theme_id: 2,
      theme_name: "テーマ2",
    });
    expect(scheduleCertificateIssuedEmail).toHaveBeenCalledTimes(1);
  });

  it("未発行の完了テーマが無ければ admin クライアントを取得しない", async () => {
    const result = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set([1]),
    });

    expect(result).toEqual({ issued: [], blockedByMissingName: false });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("受講者名が空なら発行せず、blockedByMissingName で知らせる", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const admin = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: "" }, error: null },
    });

    const result = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });

    expect(result).toEqual({ issued: [], blockedByMissingName: true });
    expect(certificateInserts(admin)).toHaveLength(0);
  });

  it("書式文字だけの表示名は空と同じく発行しない。混在するときは除いてスナップショットする", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const blank = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: "\u200B" }, error: null },
    });

    const blocked = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });

    expect(blocked).toEqual({ issued: [], blockedByMissingName: true });
    expect(certificateInserts(blank)).toHaveLength(0);

    const zwjAroundSpace = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: "\u200D \u200D" }, error: null },
    });
    const zwjBlocked = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });
    expect(zwjBlocked).toEqual({ issued: [], blockedByMissingName: true });
    expect(certificateInserts(zwjAroundSpace)).toHaveLength(0);

    const admin = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: "\u202E山田\u200B" }, error: null },
    });
    const issuedResult = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });

    expect(issuedResult.blockedByMissingName).toBe(false);
    expect(certificateInserts(admin)[0].insert.mock.calls[0][0]).toMatchObject({
      recipient_name: "山田",
    });
  });

  it("50文字超や制御文字を含む表示名は発行しない。絵文字の ZWJ は残してスナップショットする", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const tooLong = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: "あ".repeat(51) }, error: null },
    });
    const longBlocked = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });
    expect(longBlocked).toEqual({ issued: [], blockedByMissingName: true });
    expect(certificateInserts(tooLong)).toHaveLength(0);

    const withNewline = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: "山田\n太郎" }, error: null },
    });
    const newlineBlocked = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });
    expect(newlineBlocked).toEqual({ issued: [], blockedByMissingName: true });
    expect(certificateInserts(withNewline)).toHaveLength(0);

    const family = "👨\u200D👩";
    const admin = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: family }, error: null },
    });
    const issuedResult = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });
    expect(issuedResult.blockedByMissingName).toBe(false);
    expect(certificateInserts(admin)[0].insert.mock.calls[0][0]).toMatchObject({
      recipient_name: family,
    });
  });

  it("表示名が入っていれば発行し、修了証行は UPDATE しない（スナップショットは変えない）", async () => {
    const admin = mockAdminClient({
      certificates: inserted,
      users: { data: { display_name: "佐藤 花子" }, error: null },
    });

    const result = await issueMissingCertificates({
      ...eligible,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });

    expect(result.blockedByMissingName).toBe(false);
    expect(result.issued).toEqual([inserted.data]);
    expect(certificateInserts(admin)[0].insert.mock.calls[0][0]).toMatchObject({
      recipient_name: "佐藤 花子",
    });
    for (const { value } of admin.from.mock.results) {
      expect(value.update).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["trial", "member"],
    ["active", "admin"],
  ] as const)("status=%s role=%s には発行しない", async (userStatus, userRole) => {
    const result = await issueMissingCertificates({
      userId: 2,
      userStatus,
      userRole,
      summaries: [done(1)] as never,
      issuedThemeIds: new Set(),
    });

    expect(result).toEqual({ issued: [], blockedByMissingName: false });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("競合で既に発行済み（UNIQUE 違反）なら何も返さず、メールも送らない。失敗しても例外にしない", async () => {
    mockAdminClient({
      certificates: {
        data: null,
        error: { code: "23505", message: 'violates "certificates_user_theme_unique"' },
      },
    });
    expect(
      await issueMissingCertificates({
        ...eligible,
        summaries: [done(1)] as never,
        issuedThemeIds: new Set(),
      })
    ).toEqual({ issued: [], blockedByMissingName: false });
    expect(scheduleCertificateIssuedEmail).not.toHaveBeenCalled();

    vi.mocked(createAdminSupabaseClient).mockRejectedValue(new Error("no key"));
    await expect(
      issueMissingCertificates({
        ...eligible,
        summaries: [done(1)] as never,
        issuedThemeIds: new Set(),
      })
    ).resolves.toEqual({ issued: [], blockedByMissingName: false });
  });
});

function exerciseCatalog(
  themeId: number,
  contents: { id: number; allowed: string; contentType?: string; hasRubric?: boolean }[]
) {
  return {
    data: [
      {
        id: themeId,
        phases: [
          {
            contents: contents.map((content) => ({
              id: content.id,
              content_type: content.contentType ?? "exercise",
              allowed_submission_types: content.allowed,
              has_grading_requirements: content.hasRubric === true,
            })),
          },
        ],
      },
    ],
    error: null,
  };
}

describe("演習の提出・合格（#332）", () => {
  const issue = {
    userId: 2,
    userStatus: "active" as const,
    userRole: "member" as const,
    themeId: THEME.id,
  };

  it("演習が未提出なら発行しない", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "code" }]),
      submissions: { data: [], error: null },
    });
    mockAdminClient({ certificates: inserted });

    expect(await maybeIssueCertificate(issue)).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("合格点が 0 のときは提出があれば、不合格レビューでも発行する", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "code" }]),
      submissions: { data: [{ id: 7, content_id: 10 }], error: null },
    });
    mockAdminClient({ certificates: inserted });

    expect(await maybeIssueCertificate(issue)).toEqual(inserted.data);
  });

  it("URL のみの演習は提出があれば発行する", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "url" }]),
      submissions: { data: [{ id: 7, content_id: 10 }], error: null },
    });
    mockAdminClient({ certificates: inserted });

    expect(await maybeIssueCertificate({ ...issue, passScore: 80 })).toEqual(inserted.data);
  });

  it("採点基準ありで passed = false だけなら発行しない", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "code", hasRubric: true }]),
      submissions: { data: [{ id: 7, content_id: 10 }], error: null },
      ai_reviews: {
        data: [{ submission_id: 7, score_kind: "rubric", passed: false }],
        error: null,
      },
    });

    expect(await maybeIssueCertificate({ ...issue, passScore: 80 })).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("生成列が false（墓石・未設定）なら合格点があっても提出だけで発行する", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "code", hasRubric: false }]),
      submissions: { data: [{ id: 7, content_id: 10 }], error: null },
    });
    mockAdminClient({ certificates: inserted });

    expect(await maybeIssueCertificate({ ...issue, passScore: 80 })).toEqual(inserted.data);
  });

  it("passed = true が 1 件あれば発行する", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "both", hasRubric: true }]),
      submissions: { data: [{ id: 7, content_id: 10 }], error: null },
      ai_reviews: {
        data: [
          { submission_id: 7, score_kind: "none", passed: true },
          { submission_id: 7, score_kind: "rubric", passed: false },
          { submission_id: 7, score_kind: "rubric", passed: true },
        ],
        error: null,
      },
    });
    mockAdminClient({ certificates: inserted });

    expect(await maybeIssueCertificate({ ...issue, passScore: 80 })).toEqual(inserted.data);
  });

  it.each(["estimated", "none", "legacy"])("%s だけでは発行しない", async (scoreKind) => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "code", hasRubric: true }]),
      submissions: { data: [{ id: 7, content_id: 10 }], error: null },
      ai_reviews: {
        data: [{ submission_id: 7, score_kind: scoreKind, passed: true }],
        error: null,
      },
    });

    expect(await maybeIssueCertificate({ ...issue, passScore: 80 })).toBeNull();
  });

  it("動画だけのテーマは提出を見ずに発行する（分母は進捗集計のまま）", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [
        { id: 10, allowed: "code", contentType: "video" },
      ]),
    });
    mockAdminClient({ certificates: inserted });

    expect(await maybeIssueCertificate(issue)).toEqual(inserted.data);
    expect(fetchThemeProgressSummary).toHaveBeenCalledWith(2, THEME.id);
  });

  it("遡及発行も未提出の演習があるテーマは飛ばす", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(2, [{ id: 10, allowed: "code" }]),
      submissions: { data: [], error: null },
    });
    mockAdminClient({ certificates: inserted });

    const result = await issueMissingCertificates({
      userId: 2,
      userStatus: "active",
      userRole: "member",
      summaries: [
        { theme: { id: 2, name: "テーマ2" }, totalContents: 1, completedContents: 1 },
      ] as never,
      issuedThemeIds: new Set(),
    });

    expect(result).toEqual({ issued: [], blockedByMissingName: false });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("AI レビュー完了から発行し、発行済みなら二重に作らない", async () => {
    mockAdminClient({ certificates: inserted });
    const issuedNotice = await resolveAiReviewThemeNotice({
      userId: 2,
      userStatus: "active",
      userRole: "member",
      contentId: 10,
      passed: true,
    });
    expect(issuedNotice?.certificateId).toBe(31);

    mockUserClient({ certificates: { data: { id: 31 }, error: null } });
    vi.mocked(createAdminSupabaseClient).mockClear();
    expect(
      await resolveAiReviewThemeNotice({
        userId: 2,
        userStatus: "active",
        userRole: "member",
        contentId: 10,
        passed: true,
      })
    ).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("合格していない再レビューでは、条件が残るあいだ通知しない", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "code", hasRubric: true }]),
      submissions: { data: [{ id: 7, content_id: 10 }], error: null },
      ai_reviews: {
        data: [{ submission_id: 7, score_kind: "rubric", passed: false }],
        error: null,
      },
    });

    expect(
      await resolveAiReviewThemeNotice({
        userId: 2,
        userStatus: "active",
        userRole: "member",
        contentId: 10,
        passed: false,
        passScore: 80,
      })
    ).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([null, false] as const)(
    "passed=%s の再レビューでは、発行できなければ通知しない",
    async (passed) => {
      mockUserClient({
        learning_themes: exerciseCatalog(THEME.id, [
          { id: 10, allowed: "code", hasRubric: true },
          { id: 11, allowed: "code", hasRubric: true },
        ]),
        submissions: {
          data: [
            { id: 7, content_id: 10 },
            { id: 8, content_id: 11 },
          ],
          error: null,
        },
        ai_reviews: {
          data: [{ submission_id: 7, score_kind: "rubric", passed: true }],
          error: null,
        },
      });

      expect(
        await resolveAiReviewThemeNotice({
          userId: 2,
          userStatus: "active",
          userRole: "member",
          contentId: 10,
          passed,
          passScore: 80,
        })
      ).toBeNull();
    }
  );

  it("合格したレビューで別の演習が残るときは通知する", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [
        { id: 10, allowed: "code", hasRubric: true },
        { id: 11, allowed: "code", hasRubric: true },
      ]),
      submissions: {
        data: [
          { id: 7, content_id: 10 },
          { id: 8, content_id: 11 },
        ],
        error: null,
      },
      ai_reviews: {
        data: [{ submission_id: 7, score_kind: "rubric", passed: true }],
        error: null,
      },
    });

    const notice = await resolveAiReviewThemeNotice({
      userId: 2,
      userStatus: "active",
      userRole: "member",
      contentId: 10,
      passed: true,
      passScore: 80,
    });

    expect(notice?.certificateId).toBeNull();
    expect(notice?.remaining.exercisesNeedingRetry).toBe(1);
  });

  it("合格していない再レビューでも、この呼び出しで発行できたときは通知する", async () => {
    mockAdminClient({ certificates: inserted });

    const notice = await resolveAiReviewThemeNotice({
      userId: 2,
      userStatus: "active",
      userRole: "member",
      contentId: 10,
      passed: false,
    });

    expect(notice?.certificateId).toBe(31);
  });

  it("メール予約の失敗でも発行済みの通知は返す", async () => {
    mockAdminClient({ certificates: inserted });
    vi.mocked(scheduleCertificateIssuedEmail).mockImplementationOnce(() => {
      throw new Error("mail down");
    });

    await expect(
      resolveAiReviewThemeNotice({
        userId: 2,
        userStatus: "active",
        userRole: "member",
        contentId: 10,
        passed: true,
      })
    ).resolves.toMatchObject({ certificateId: 31 });
  });
});

describe("テーマ修了の画面通知（#332）", () => {
  const noticeParams = {
    userId: 2,
    userStatus: "active" as const,
    userRole: "member" as const,
    contentId: 10,
    contentWasAlreadyCompleted: false,
  };

  it("最後のコンテンツで発行済みの通知を返す", async () => {
    mockAdminClient({ certificates: inserted });

    const notice = await resolveProgressThemeNotice(noticeParams);

    expect(notice).toMatchObject({
      themeId: THEME.id,
      themeName: THEME.name,
      certificateId: 31,
      remaining: { incompleteContents: 0, unsubmittedExercises: 0, exercisesNeedingRetry: 0 },
    });
  });

  it("途中では通知しない", async () => {
    mockSummaries([summary(3, 2)]);

    expect(await resolveProgressThemeNotice(noticeParams)).toBeNull();
  });

  it("条件が残るときは未発行の通知を返す", async () => {
    mockUserClient({
      learning_themes: exerciseCatalog(THEME.id, [{ id: 10, allowed: "code" }]),
      submissions: { data: [], error: null },
    });

    const notice = await resolveProgressThemeNotice(noticeParams);

    expect(notice?.certificateId).toBeNull();
    expect(notice?.remaining.unsubmittedExercises).toBe(1);
  });

  it("すでに完了しているコンテンツの再保存では通知しない", async () => {
    expect(
      await resolveProgressThemeNotice({ ...noticeParams, contentWasAlreadyCompleted: true })
    ).toBeNull();
    expect(fetchThemeProgressSummary).not.toHaveBeenCalled();
  });

  it.each([
    ["trial", "member"],
    ["active", "admin"],
    ["active", "maintainer"],
  ] as const)("status=%s role=%s には通知しない", async (userStatus, userRole) => {
    expect(await resolveProgressThemeNotice({ ...noticeParams, userStatus, userRole })).toBeNull();
    expect(fetchThemeProgressSummary).not.toHaveBeenCalled();
  });

  it("集計が throw したら例外を伝播する（進捗 API が after で再試行するため）", async () => {
    vi.mocked(fetchThemeProgressSummary).mockRejectedValue(new Error("down"));

    await expect(resolveProgressThemeNotice(noticeParams)).rejects.toThrow("down");
  });

  it("集計の読み取りエラーも例外にして、未完了扱いにはしない", async () => {
    vi.mocked(fetchThemeProgressSummary).mockResolvedValue({
      data: null,
      error: { message: "x" } as never,
    });

    await expect(resolveProgressThemeNotice(noticeParams)).rejects.toThrow(
      "発行判定の読み取りに失敗しました"
    );
  });
});

describe("閲覧用クエリ", () => {
  it("修了証の取得は id と user_id の両方で絞る（他人の修了証は取れない）", async () => {
    const client = mockUserClient({ certificates: { data: null, error: null } });

    const { data } = await fetchMyCertificateById(2, 31);

    expect(data).toBeNull();
    const builder = client.from.mock.results[0].value as { eq: { mock: { calls: unknown[][] } } };
    expect(builder.eq.mock.calls).toEqual([
      ["id", 31],
      ["user_id", 2],
    ]);
  });

  it("ダッシュボード用は発行から14日以内に絞る", async () => {
    const client = mockUserClient({ certificates: { data: null, error: null } });

    await fetchRecentCertificate(2, new Date("2026-10-20T00:00:00Z"));

    const builder = client.from.mock.results[0].value as { gte: { mock: { calls: unknown[][] } } };
    expect(builder.gte.mock.calls).toEqual([["issued_at", "2026-10-06T00:00:00.000Z"]]);
  });

  it("受講生ごとの枚数を数える。取得に失敗したら空の Map を返す", async () => {
    mockUserClient({
      certificates: { data: [{ user_id: 2 }, { user_id: 2 }, { user_id: 3 }], error: null },
    });
    const counts = await fetchCertificateCountsByUser();
    expect(counts.get(2)).toBe(2);
    expect(counts.get(3)).toBe(1);

    mockUserClient({ certificates: { data: null, error: { message: "x" } } });
    expect((await fetchCertificateCountsByUser()).size).toBe(0);
  });
});
