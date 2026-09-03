import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/learning-server");
vi.mock("@/app/services/api/supabase-server");

import { POST } from "@/app/api/submissions/route";
import { isContentVisible } from "@/app/services/api/learning-server";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const request = (
  body: unknown = { contentId: 1, submissionType: "code", codeContent: "console.log(1)" }
) =>
  new Request("http://localhost/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const mockInsert = (result: { data: unknown; error: unknown }) => {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({ insert }),
  } as never);
  return insert;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(isContentVisible).mockResolvedValue(true);
});

describe("POST /api/submissions", () => {
  it("未認証は401を返す", async () => {
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

  it("対象コンテンツが不可視の場合は403", async () => {
    vi.mocked(isContentVisible).mockResolvedValue(false);

    const res = await POST(request() as never);

    expect(res.status).toBe(403);
  });

  it("認証ユーザーのIDでINSERTし、200を返す", async () => {
    const insert = mockInsert({ data: { id: 1 }, error: null });

    const res = await POST(request() as never);

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: memberAuth.userId, content_id: 1 })
    );
  });

  it("ボディに userId を含めても無視され、認証ユーザーとして処理される（403にならない）", async () => {
    const insert = mockInsert({ data: { id: 1 }, error: null });

    const res = await POST(
      request({
        contentId: 1,
        userId: 999,
        submissionType: "code",
        codeContent: "console.log(1)",
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: memberAuth.userId }));
  });
});
