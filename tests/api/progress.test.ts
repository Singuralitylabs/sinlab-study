import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");

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
});

describe("POST /api/progress", () => {
  it("未認証は401を返し、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(401);
  });

  it("rejected ユーザーは403を返す", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
  });

  it("contentIdが不足している場合は400", async () => {
    const res = await POST(request({ isCompleted: true }) as never);

    expect(res.status).toBe(400);
  });

  it("対象コンテンツが不可視の場合は403", async () => {
    vi.mocked(isContentVisible).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
  });

  it("認証ユーザーのIDでupsertし、200を返す", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ upsert }),
    } as never);

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: memberAuth.userId, content_id: 1 }),
      expect.anything()
    );
  });

  it("ボディに userId を含めても無視され、認証ユーザーとして処理される（403にならない）", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ upsert }),
    } as never);

    // 他人になりすまそうとする userId を送っても、認証ユーザーのIDが使われる
    const res = await POST(request({ contentId: 1, userId: 999, isCompleted: true }) as never);

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: memberAuth.userId }),
      expect.anything()
    );
  });
});
