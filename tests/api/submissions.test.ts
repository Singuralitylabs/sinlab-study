import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, createQueryBuilder } from "@/tests/helpers/supabase-mock";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(isContentVisible).mockResolvedValue(true);
  vi.mocked(createServerSupabaseClient).mockResolvedValue(
    createMockSupabaseClient({
      tableResults: { submissions: { data: { id: 1 }, error: null } },
    }) as never
  );
});

describe("POST /api/submissions - 認可", () => {
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

describe("POST /api/submissions - バリデーション", () => {
  it.each([
    ["未指定", undefined],
    ["文字列", "1"],
    ["0", 0],
    ["負数", -1],
    ["小数", 1.5],
  ])("contentIdが%sの場合は400", async (_label, contentId) => {
    const res = await POST(
      request({ contentId, submissionType: "code", codeContent: "console.log(1)" }) as never
    );

    expect(res.status).toBe(400);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/submissions - 認証ユーザーIDでの書き込み", () => {
  it.each([
    [
      "userIdを送らない場合",
      { contentId: 1, submissionType: "code", codeContent: "console.log(1)" },
    ],
    [
      "他人になりすます userId を送っても無視される場合",
      { contentId: 1, userId: 999, submissionType: "code", codeContent: "console.log(1)" },
    ],
  ])("%s、認証ユーザーのIDでINSERTし200を返す", async (_label, body) => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const insert = vi
      .fn()
      .mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), single });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ ...createQueryBuilder({ data: null, error: null }), insert }),
    } as never);

    const res = await POST(request(body) as never);

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: memberAuth.userId, content_id: 1 })
    );
  });
});
