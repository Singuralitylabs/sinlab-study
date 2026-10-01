import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");
vi.mock("@vercel/analytics/server", () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

import { track } from "@vercel/analytics/server";
import { POST } from "@/app/api/progress/route";
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
    const writeBuilder = client.from.mock.results[1]?.value as {
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
