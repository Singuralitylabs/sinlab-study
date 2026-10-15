import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH } from "@/app/constants/user";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/user-profile-server");

import { PATCH } from "@/app/api/settings/profile/route";
import { updateUserDisplayName } from "@/app/services/api/user-profile-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/settings/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(updateUserDisplayName).mockResolvedValue({ data: "山田 太郎", error: null });
});

describe("PATCH /api/settings/profile - 認可", () => {
  it("未認証は401を返し、更新しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await PATCH(request({ displayName: "山田" }));

    expect(res.status).toBe(401);
    expect(updateUserDisplayName).not.toHaveBeenCalled();
  });

  it("userId 無しは403を返し、更新しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userId: null } as never);

    const res = await PATCH(request({ displayName: "山田" }));

    expect(res.status).toBe(403);
    expect(updateUserDisplayName).not.toHaveBeenCalled();
  });

  it.each(["rejected", null])(
    "許可されていないステータス（%s）は403を返し、更新しない",
    async (userStatus) => {
      vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userStatus } as never);

      const res = await PATCH(request({ displayName: "山田" }));

      expect(res.status).toBe(403);
      expect(updateUserDisplayName).not.toHaveBeenCalled();
    }
  );
});

describe("PATCH /api/settings/profile - 入力検証", () => {
  it.each([
    ["空", { displayName: "  " }],
    ["上限超え", { displayName: "あ".repeat(DISPLAY_NAME_MAX_LENGTH + 1) }],
    ["制御文字", { displayName: "山田\n太郎" }],
    ["文字列でない", { displayName: 1 }],
    ["displayName が無い", { role: "admin" }],
  ])("%s は400を返し、更新しない", async (_label, body) => {
    const res = await PATCH(request(body));

    expect(res.status).toBe(400);
    expect(updateUserDisplayName).not.toHaveBeenCalled();
  });

  it("JSON でないボディは400を返す", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/settings/profile", { method: "PATCH", body: "not json" })
    );

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/settings/profile - 更新", () => {
  it("呼び出し本人の行の display_name だけを更新し、保存後の名前を返す", async () => {
    const res = await PATCH(
      request({ displayName: "  山田 太郎  ", role: "admin", userId: 99, status: "rejected" })
    );

    expect(res.status).toBe(200);
    expect(updateUserDisplayName).toHaveBeenCalledTimes(1);
    expect(updateUserDisplayName).toHaveBeenCalledWith(memberAuth.userId, "山田 太郎");
    expect(await res.json()).toEqual({ displayName: "山田 太郎" });
  });

  it("trial でも自分の表示名を更新できる", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "trial",
    } as never);

    const res = await PATCH(request({ displayName: "山田" }));

    expect(res.status).toBe(200);
    expect(updateUserDisplayName).toHaveBeenCalledWith(memberAuth.userId, "山田");
  });

  it("更新が0行、または DB エラーなら500を返す", async () => {
    vi.mocked(updateUserDisplayName).mockResolvedValue({ data: null, error: null });
    expect((await PATCH(request({ displayName: "山田" }))).status).toBe(500);

    vi.mocked(updateUserDisplayName).mockResolvedValue({
      data: null,
      error: { message: "db error" } as never,
    });
    expect((await PATCH(request({ displayName: "山田" }))).status).toBe(500);
  });
});
