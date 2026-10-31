import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/supabase-mock";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");

import { POST } from "@/app/api/progress/view/route";
import { LAST_VIEWED_AT_DEBOUNCE_MS } from "@/app/constants/progress";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const request = (body: unknown = { contentId: 1 }) =>
  new Request("http://localhost/api/progress/view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(createServerSupabaseClient).mockResolvedValue(
    createMockSupabaseClient({
      rpcResults: {
        record_content_view: { data: { success: true, skipped: false }, error: null },
      },
    }) as never
  );
});

describe("POST /api/progress/view - 認可", () => {
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

  it("不可視コンテンツは RPC の 42501 を 403 にする", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        rpcResults: {
          record_content_view: {
            data: null,
            error: { code: "42501", message: "content not visible" },
          },
        },
      }) as never
    );

    const res = await POST(request() as never);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("対象のコンテンツにアクセスできません");
  });
});

describe("POST /api/progress/view - バリデーション", () => {
  it.each([
    ["未指定", undefined],
    ["文字列", "1"],
    ["0", 0],
    ["負数", -1],
    ["小数", 1.5],
  ])("contentIdが%sの場合は400", async (_label, contentId) => {
    const res = await POST(request({ contentId }) as never);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/progress/view - RPC", () => {
  it("record_content_view に contentId と debounce 定数を渡し success を返す", async () => {
    const client = createMockSupabaseClient({
      rpcResults: {
        record_content_view: { data: { success: true, skipped: false }, error: null },
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(client as never);

    const res = await POST(request({ contentId: 42 }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(client.rpc).toHaveBeenCalledWith("record_content_view", {
      p_content_id: 42,
      p_debounce_ms: LAST_VIEWED_AT_DEBOUNCE_MS,
    });
  });

  it("debounce スキップ時は skipped: true を返す", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        rpcResults: {
          record_content_view: { data: { success: true, skipped: true }, error: null },
        },
      }) as never
    );

    const res = await POST(request() as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, skipped: true });
  });

  it("RPC のその他エラーは 500", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      createMockSupabaseClient({
        rpcResults: {
          record_content_view: {
            data: null,
            error: { code: "XX000", message: "boom" },
          },
        },
      }) as never
    );

    const res = await POST(request() as never);
    expect(res.status).toBe(500);
  });
});
