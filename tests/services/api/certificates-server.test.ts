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
} from "@/app/services/api/certificates-server";
import { fetchThemeProgressSummaries } from "@/app/services/api/learning-server";
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
}

function mockUserClient(tableResults: Record<string, QueryResult | QueryResult[]> = {}) {
  const client = createMockSupabaseClient({
    tableResults: {
      learning_contents: { data: { week: { phase: { theme_id: THEME.id } } }, error: null },
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

  it("未完了が1件でもあれば発行しない（admin クライアントも取得しない）", async () => {
    mockSummaries([summary(3, 2)]);
    mockAdminClient({ certificates: inserted });

    expect(await issueCertificateIfEligible(params)).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("分母は fetchThemeProgressSummaries の集計（未公開を含まない）をそのまま使う", async () => {
    // Unpublished contents are already excluded from totalContents by that function, so 2/2
    // completes even if an unpublished third content is incomplete.
    mockSummaries([summary(2, 2)]);
    mockAdminClient({ certificates: inserted });

    expect(await issueCertificateIfEligible(params)).not.toBeNull();
    expect(fetchThemeProgressSummaries).toHaveBeenCalledWith(2);
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
    expect(fetchThemeProgressSummaries).not.toHaveBeenCalled();
  });

  it("コンテンツが属するテーマ以外の完了では発行しない", async () => {
    mockUserClient({
      learning_contents: { data: { week: { phase: { theme_id: 99 } } }, error: null },
    });

    expect(await issueCertificateIfEligible(params)).toBeNull();
  });
});

describe("issueCertificateIfEligible - 冪等性・失敗時", () => {
  it("(user_id, theme_id) の UNIQUE 違反は発行済みとして扱い、再試行もメールもしない", async () => {
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

    expect(await issueCertificateIfEligible(params)).toBeNull();
    expect(certificateInserts(admin)).toHaveLength(1);
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

  it("想定外の例外（admin クライアント生成失敗・メール予約失敗）も握りつぶして null を返す", async () => {
    vi.mocked(createAdminSupabaseClient).mockRejectedValue(new Error("no service role key"));
    await expect(issueCertificateIfEligible(params)).resolves.toBeNull();

    mockAdminClient({ certificates: inserted });
    vi.mocked(scheduleCertificateIssuedEmail).mockImplementationOnce(() => {
      throw new Error("mail down");
    });
    await expect(issueCertificateIfEligible(params)).resolves.toBeNull();
  });

  it("集計の取得に失敗したら発行しない", async () => {
    vi.mocked(fetchThemeProgressSummaries).mockResolvedValue({
      data: null,
      error: { message: "x" } as never,
    });

    expect(await issueCertificateIfEligible(params)).toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
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
