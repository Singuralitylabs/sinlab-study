import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/certificates-server");
vi.mock("@/app/services/api/supabase-server");
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // Explicit rather than the real after(), so these tests do not depend on how Next.js behaves
  // outside a request scope: the default throws, and the route runs the task inline.
  after: vi.fn(() => {
    throw new Error("outside request scope");
  }),
}));
vi.mock("@vercel/analytics/server", () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

import { track } from "@vercel/analytics/server";
import { after } from "next/server";
import { POST } from "@/app/api/progress/route";
import {
  issueCertificateIfEligible,
  resolveProgressThemeNotice,
} from "@/app/services/api/certificates-server";
import { isContentVisible } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const request = (body: unknown = { contentId: 1, isCompleted: true }) =>
  new Request("http://localhost/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(isContentVisible).mockResolvedValue(true);
  vi.mocked(issueCertificateIfEligible).mockResolvedValue(null);
  vi.mocked(createServerSupabaseClient).mockResolvedValue(
    createMockSupabaseClient({
      tableResults: { user_progress: { data: null, error: null } },
    }) as never
  );
});

describe("POST /api/progress - 認可", () => {
  it("未認証は401を返し、DBクライアントを取得しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(401);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejected ユーザーは403を返し、DBクライアントを取得しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("対象コンテンツが不可視の場合は403", async () => {
    vi.mocked(isContentVisible).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
  });
});

describe("POST /api/progress - バリデーション", () => {
  it.each([
    ["未指定", undefined],
    ["文字列", "1"],
    ["0", 0],
    ["負数", -1],
    ["小数", 1.5],
  ])("contentIdが%sの場合は400", async (_label, contentId) => {
    const res = await POST(request({ contentId, isCompleted: true }) as never);

    expect(res.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([
    ["未指定", undefined],
    ["文字列", "true"],
  ])("isCompletedが%sの場合は400", async (_label, isCompleted) => {
    const res = await POST(request({ contentId: 1, isCompleted }) as never);

    expect(res.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/progress - 認証ユーザーIDでの書き込み", () => {
  it.each([
    ["userIdを送らない場合", { contentId: 1, isCompleted: true }],
    [
      "他人になりすます userId を送っても無視される場合",
      { contentId: 1, userId: 999, isCompleted: true },
    ],
  ])("%s、認証ユーザーのIDでupsertし200を返す", async (_label, body) => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const builder = { ...createQueryBuilder({ data: null, error: null }), upsert };
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(builder),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    } as never);

    const res = await POST(request(body) as never);

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: memberAuth.userId, content_id: 1 }),
      expect.anything()
    );
  });
});

describe("POST /api/progress - first_content_completed", () => {
  it("完了行が無いときだけ status を付けて送る", async () => {
    const client = createMockSupabaseClient({
      tableResults: {
        user_progress: [
          { data: null, error: null, count: 0 },
          { data: null, error: null },
        ],
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    const countBuilder = client.from.mock.results[0]?.value as {
      eq: { mock: { calls: unknown[][] } };
    };
    expect(countBuilder.eq.mock.calls).toContainEqual(["ever_completed", true]);
    const writeBuilder = client.from.mock.results[2]?.value as {
      upsert: { mock: { calls: unknown[][] } };
    };
    expect(writeBuilder.upsert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ ever_completed: true, is_completed: true })
    );
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("first_content_completed", { status: "active" });
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("email");
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain("user_id");
  });

  it("既に完了行があるときは送らない", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          user_progress: [
            { data: null, error: null, count: 2 },
            { data: null, error: null },
          ],
        },
      }) as never
    );

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(track).not.toHaveBeenCalled();
  });

  it("未完了への更新では送らず、ever_completed は消さない", async () => {
    const client = createMockSupabaseClient({
      tableResults: { user_progress: { data: null, error: null } },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await POST(request({ contentId: 1, isCompleted: false }) as never);

    expect(res.status).toBe(200);
    expect(track).not.toHaveBeenCalled();
    const writeBuilder = client.from.mock.results[0]?.value as {
      upsert: { mock: { calls: unknown[][] } };
    };
    const payload = writeBuilder.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("ever_completed");
    expect(payload.completed_at).toBeNull();
  });

  it("件数取得に失敗しても進捗更新は成功し、イベントは送らない", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: {
          user_progress: [
            { data: null, error: { message: "count failed" }, count: null },
            { data: null, error: null },
          ],
        },
      }) as never
    );

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(track).not.toHaveBeenCalled();
  });

  it("track が拒否してもレスポンスは変わらない", async () => {
    vi.mocked(track).mockRejectedValueOnce(new Error("analytics down"));

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, isCompleted: true });
  });
});

describe("POST /api/progress - 修了証の発行（#291）", () => {
  it("完了に更新した直後に、認証ユーザーの ID・status・role と contentId で発行判定を呼ぶ", async () => {
    const res = await POST(request({ contentId: 1, isCompleted: true }) as never);

    expect(res.status).toBe(200);
    expect(issueCertificateIfEligible).toHaveBeenCalledWith({
      userId: memberAuth.userId,
      userStatus: memberAuth.userStatus,
      userRole: memberAuth.userRole,
      contentId: 1,
    });
  });

  it("after() が使える場合はレスポンス後に回し、使えない場合はその場で実行する", async () => {
    const scheduled: Array<() => unknown> = [];
    vi.mocked(after).mockImplementationOnce(((task: () => unknown) => {
      scheduled.push(task);
    }) as never);

    await POST(request() as never);
    expect(issueCertificateIfEligible).not.toHaveBeenCalled();
    await scheduled[0]();
    expect(issueCertificateIfEligible).toHaveBeenCalledTimes(1);

    vi.mocked(after).mockImplementationOnce((() => {
      throw new Error("outside request scope");
    }) as never);
    await POST(request() as never);
    expect(issueCertificateIfEligible).toHaveBeenCalledTimes(2);
  });

  it("完了の取り消しでは発行判定を呼ばない", async () => {
    await POST(request({ contentId: 1, isCompleted: false }) as never);

    expect(issueCertificateIfEligible).not.toHaveBeenCalled();
  });

  it("進捗の保存に失敗したら発行判定を呼ばない", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        tableResults: { user_progress: { data: null, error: { message: "db error" } } },
      }) as never
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request() as never);

    expect(res.status).toBe(500);
    expect(issueCertificateIfEligible).not.toHaveBeenCalled();
  });

  it("発行した場合も、発行しなかった場合も、レスポンスは同じ", async () => {
    const without = await (await POST(request() as never)).json();

    vi.mocked(issueCertificateIfEligible).mockResolvedValue({
      id: 1,
      theme_id: 1,
      certificate_no: "SS-202610-ABC123",
      theme_name: "テーマ",
    });
    const withCertificate = await (await POST(request() as never)).json();

    expect(withCertificate).toEqual(without);
    expect(withCertificate).toEqual({ success: true, isCompleted: true });
  });
});

describe("POST /api/progress - テーマ修了の画面通知（#332）", () => {
  const notice = {
    themeId: 5,
    themeName: "GAS 学習（基礎編）",
    certificateId: 31,
    blockedByMissingName: false,
    remaining: {
      incompleteContents: 0,
      unsubmittedExercises: 0,
      exercisesNeedingRetry: 0,
    },
  };

  it("100% になった完了では通知を返し、after() の発行は重ねない", async () => {
    vi.mocked(resolveProgressThemeNotice).mockResolvedValue(notice);

    const res = await POST(request({ contentId: 1, isCompleted: true }) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      isCompleted: true,
      themeCompletion: notice,
    });
    expect(issueCertificateIfEligible).not.toHaveBeenCalled();
    expect(resolveProgressThemeNotice).toHaveBeenCalledWith({
      userId: memberAuth.userId,
      userStatus: memberAuth.userStatus,
      userRole: memberAuth.userRole,
      contentId: 1,
      contentWasAlreadyCompleted: false,
    });
  });

  it("途中の完了では通知を付けず、従来どおり after() で発行判定する", async () => {
    vi.mocked(resolveProgressThemeNotice).mockResolvedValue(null);

    const body = await (await POST(request() as never)).json();

    expect(body).toEqual({ success: true, isCompleted: true });
    expect(issueCertificateIfEligible).toHaveBeenCalledTimes(1);
  });

  it("完了の取り消しでは通知も発行もしない", async () => {
    await POST(request({ contentId: 1, isCompleted: false }) as never);

    expect(resolveProgressThemeNotice).not.toHaveBeenCalled();
    expect(issueCertificateIfEligible).not.toHaveBeenCalled();
  });

  it("通知判定が落ちても進捗 API は成功のまま", async () => {
    vi.mocked(resolveProgressThemeNotice).mockRejectedValue(new Error("aggregate down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, isCompleted: true });
    expect(issueCertificateIfEligible).toHaveBeenCalledTimes(1);
  });

  it("お試し・admin / maintainer 向けの空通知はレスポンスに載せない", async () => {
    vi.mocked(resolveProgressThemeNotice).mockResolvedValue(null);
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "trial",
      userRole: "member",
    } as never);

    const trial = await (await POST(request() as never)).json();
    expect(trial).toEqual({ success: true, isCompleted: true });

    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "active",
      userRole: "admin",
    } as never);
    const admin = await (await POST(request() as never)).json();
    expect(admin).toEqual({ success: true, isCompleted: true });
  });
});

describe("POST /api/progress - 合格判定対象の演習（#367）", () => {
  const gatedClient = (submissions: { data: unknown; error: unknown } | null) => {
    const client = createMockSupabaseClient({
      rpcResults: {
        content_requires_review_pass: { data: true, error: null },
      },
      tableResults: {
        ...(submissions ? { submissions } : {}),
        user_progress: { data: null, error: null, count: 1 },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);
    return client;
  };

  it("合格レビューが無ければ手動完了を 403 にし、進捗は書かない", async () => {
    const client = gatedClient({ data: [], error: null });

    const res = await POST(request({ contentId: 1, isCompleted: true }) as never);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "AIレビューで合格すると完了になります",
    });
    expect(client.from.mock.calls.map((call) => call[0])).not.toContain("user_progress");
    expect(issueCertificateIfEligible).not.toHaveBeenCalled();
  });

  it("合格済みなら完了を許可し、修了証の判定を予約する", async () => {
    gatedClient({ data: [{ id: 9 }], error: null });

    const res = await POST(request({ contentId: 1, isCompleted: true }) as never);

    expect(res.status).toBe(200);
    expect(issueCertificateIfEligible).toHaveBeenCalledWith({
      userId: memberAuth.userId,
      userStatus: memberAuth.userStatus,
      userRole: memberAuth.userRole,
      contentId: 1,
    });
  });

  it("未完了への変更を拒否する", async () => {
    const client = gatedClient(null);

    const res = await POST(request({ contentId: 1, isCompleted: false }) as never);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "合格判定のある演習は未完了に戻せません",
    });
    expect(client.from.mock.calls.map((call) => call[0])).not.toContain("user_progress");
    expect(issueCertificateIfEligible).not.toHaveBeenCalled();
  });

  it("トリガーの 42501 は 403 に変換する", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        rpcResults: {
          content_requires_review_pass: { data: false, error: null },
        },
        tableResults: {
          user_progress: {
            data: null,
            error: {
              code: "42501",
              message: "pass-gated exercise requires a passing review",
            },
          },
        },
      }) as never
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "AIレビューで合格すると完了になります",
    });
    expect(issueCertificateIfEligible).not.toHaveBeenCalled();
  });
});
