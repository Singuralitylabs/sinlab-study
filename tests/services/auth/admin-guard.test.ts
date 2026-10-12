import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");

import { requireContentManagerApi } from "@/app/services/auth/admin-guard";
import { getServerAuth } from "@/app/services/auth/server-auth";

const base = { user: { id: "auth-uuid" }, userId: 1, userStatus: "active", userRole: "maintainer" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireContentManagerApi", () => {
  it.each([
    ["未認証", { ...base, user: null }, 401, "認証が必要です"],
    ["users 行なし", { ...base, userId: null }, 403, "ユーザー情報が見つかりません"],
    [
      "rejected（ロールが残っていても）",
      { ...base, userStatus: "rejected", userRole: "admin" },
      403,
      "アクセスが拒否されています",
    ],
    ["member", { ...base, userRole: "member" }, 403, "コンテンツ管理権限がありません"],
  ])("%sは拒否する", async (_label, auth, status, error) => {
    vi.mocked(getServerAuth).mockResolvedValue(auth as never);

    const { response } = await requireContentManagerApi();

    expect(response?.status).toBe(status);
    await expect(response?.json()).resolves.toEqual({ error });
  });

  it.each(["admin", "maintainer"])("%s は通し、auth を返す", async (userRole) => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...base, userRole } as never);

    const result = await requireContentManagerApi();

    expect(result.response).toBeNull();
    expect(result).toMatchObject({ auth: { userRole } });
  });
});
