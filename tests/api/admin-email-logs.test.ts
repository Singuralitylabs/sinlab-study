import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/email-settings-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/services/api/email-settings-server")>()),
  fetchEmailLogs: vi.fn(),
}));

import { GET } from "@/app/api/admin/email-logs/route";
import { fetchEmailLogs } from "@/app/services/api/email-settings-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const authAs = (overrides: Record<string, unknown> = {}) =>
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { id: "auth-uuid" },
    userId: 1,
    userStatus: "active",
    userRole: "admin",
    ...overrides,
  } as never);

const get = (query = "") => GET(new Request(`http://localhost/api/admin/email-logs${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  authAs();
  vi.mocked(fetchEmailLogs).mockResolvedValue({ data: [], hasNext: false, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/email-logs", () => {
  it("未認証は401", async () => {
    authAs({ user: null, userId: null, userStatus: null, userRole: null });

    expect((await get()).status).toBe(401);
    expect(fetchEmailLogs).not.toHaveBeenCalled();
  });

  it.each(["maintainer", "member"])("%s は403", async (role) => {
    authAs({ userRole: role });

    expect((await get()).status).toBe(403);
    expect(fetchEmailLogs).not.toHaveBeenCalled();
  });

  it("却下済みの元 admin は403", async () => {
    authAs({ userStatus: "rejected" });

    expect((await get()).status).toBe(403);
  });

  it("絞り込み・ページを渡して履歴を返す", async () => {
    vi.mocked(fetchEmailLogs).mockResolvedValue({
      data: [{ id: 1 } as never],
      hasNext: true,
      error: null,
    });

    const res = await get("?kind=weekly_digest&status=failed&page=2");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ logs: [{ id: 1 }], hasNext: true });
    expect(fetchEmailLogs).toHaveBeenCalledWith({
      kind: "weekly_digest",
      status: "failed",
      page: 2,
    });
  });

  it.each([
    ["未知の種別（繰り越し予約を含む）", "?kind=weekly_digest_reserved"],
    ["未知の状態", "?status=unknown"],
    ["ページが0", "?page=0"],
    ["ページが数値でない", "?page=abc"],
  ])("不正な絞り込みは400: %s", async (_label, query) => {
    expect((await get(query)).status).toBe(400);
    expect(fetchEmailLogs).not.toHaveBeenCalled();
  });

  it("取得に失敗したら500", async () => {
    vi.mocked(fetchEmailLogs).mockResolvedValue({
      data: null,
      hasNext: false,
      error: "送信履歴の取得に失敗しました",
    });

    expect((await get()).status).toBe(500);
  });
});
