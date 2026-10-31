import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");

import { POST } from "@/app/api/progress/retry/route";
import { isContentVisible } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const request = (body: unknown = { contentId: 1 }) =>
  new Request("http://localhost/api/progress/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(isContentVisible).mockResolvedValue(true);
});

describe("POST /api/progress/retry - 認可", () => {
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
    vi.mocked(createServerSupabaseClient).mockResolvedValue(createMockSupabaseClient() as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
  });
});

describe("POST /api/progress/retry - バリデーション", () => {
  it.each([
    ["未指定", undefined],
    ["文字列", "1"],
    ["0", 0],
    ["負数", -1],
  ])("contentIdが%sの場合は400", async (_label, contentId) => {
    const body = contentId === undefined ? {} : { contentId };
    const res = await POST(request(body) as never);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/progress/retry - 提出確認と upsert", () => {
  it("提出が無い場合は409で upsert しない", async () => {
    const submissionsBuilder = createQueryBuilder({ data: null, error: null, count: 0 });
    const progressBuilder = createQueryBuilder({ data: null, error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "submissions") return submissionsBuilder;
        if (table === "user_progress") return progressBuilder;
        return createQueryBuilder({ data: null, error: null });
      }),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(409);
    expect(progressBuilder.upsert).not.toHaveBeenCalled();
  });

  it("提出があるとき retry_started_at だけを upsert し完了列を送らない", async () => {
    const submissionsBuilder = createQueryBuilder({ data: null, error: null, count: 1 });
    const progressBuilder = createQueryBuilder({ data: null, error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "submissions") return submissionsBuilder;
        if (table === "user_progress") return progressBuilder;
        return createQueryBuilder({ data: null, error: null });
      }),
    };
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await POST(request({ contentId: 42 }) as never);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(progressBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 2,
        content_id: 42,
        retry_started_at: expect.any(String),
      }),
      { onConflict: "user_id,content_id" }
    );
    const payload = progressBuilder.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("is_completed");
    expect(payload).not.toHaveProperty("completed_at");
    expect(payload).not.toHaveProperty("ever_completed");
  });
});
