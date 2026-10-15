import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/user-email-server");

import { PATCH } from "@/app/api/settings/email/route";
import { fetchUserEmailOptOutAt, setUserEmailOptOut } from "@/app/services/api/user-email-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const memberAuth = {
  user: { id: "auth-uuid-member" },
  userId: 2,
  userStatus: "active",
  userRole: "member",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/settings/email", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const OPTED_OUT_AT = "2026-10-14T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(memberAuth as never);
  vi.mocked(setUserEmailOptOut).mockResolvedValue({ error: null, updated: true });
  vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({ data: OPTED_OUT_AT, error: null });
});

describe("PATCH /api/settings/email - 認可", () => {
  it("未認証は401を返し、更新しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await PATCH(request({ promotionalEmails: false }));

    expect(res.status).toBe(401);
    expect(setUserEmailOptOut).not.toHaveBeenCalled();
  });

  it("userId 無しは403を返し、更新しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userId: null } as never);

    const res = await PATCH(request({ promotionalEmails: false }));

    expect(res.status).toBe(403);
    expect(setUserEmailOptOut).not.toHaveBeenCalled();
  });

  it("rejected ユーザーは403を返し、更新しない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...memberAuth,
      userStatus: "rejected",
    } as never);

    const res = await PATCH(request({ promotionalEmails: false }));

    expect(res.status).toBe(403);
    expect(setUserEmailOptOut).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/settings/email - 入力検証", () => {
  it.each([
    ["promotionalEmails が無い", {}],
    ["真偽値でない", { promotionalEmails: "false" }],
    ["余計なキー（他人の userId など）", { promotionalEmails: false, userId: 99 }],
  ])("%s は400を返し、更新しない", async (_label, body) => {
    const res = await PATCH(request(body));

    expect(res.status).toBe(400);
    expect(setUserEmailOptOut).not.toHaveBeenCalled();
  });

  it("JSON でないボディは400を返す", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/settings/email", { method: "PATCH", body: "not json" })
    );

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/settings/email - 更新", () => {
  it("停止（false）は呼び出し本人の行だけを停止し、更新後の状態を返す", async () => {
    const res = await PATCH(request({ promotionalEmails: false }));

    expect(res.status).toBe(200);
    expect(setUserEmailOptOut).toHaveBeenCalledWith(memberAuth.userId, true);
    expect(fetchUserEmailOptOutAt).toHaveBeenCalledWith(memberAuth.userId);
    expect(await res.json()).toEqual({ emailOptOutAt: OPTED_OUT_AT });
  });

  it("再開（true）で停止→再開の往復ができ、NULL に戻る", async () => {
    await PATCH(request({ promotionalEmails: false }));
    vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({ data: null, error: null });

    const res = await PATCH(request({ promotionalEmails: true }));

    expect(res.status).toBe(200);
    expect(setUserEmailOptOut).toHaveBeenLastCalledWith(memberAuth.userId, false);
    expect(await res.json()).toEqual({ emailOptOutAt: null });
  });

  it("すでに同じ状態（updated: false）でもエラーにせず200で現在の状態を返す", async () => {
    vi.mocked(setUserEmailOptOut).mockResolvedValue({ error: null, updated: false });

    const res = await PATCH(request({ promotionalEmails: false }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emailOptOutAt: OPTED_OUT_AT });
  });

  it("admin / maintainer でも操作できる", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...memberAuth, userRole: "admin" } as never);

    const res = await PATCH(request({ promotionalEmails: false }));

    expect(res.status).toBe(200);
  });

  it("更新の DB エラーは500を返す", async () => {
    vi.mocked(setUserEmailOptOut).mockResolvedValue({
      error: { message: "db error" } as never,
      updated: false,
    });

    const res = await PATCH(request({ promotionalEmails: false }));

    expect(res.status).toBe(500);
    expect(fetchUserEmailOptOutAt).not.toHaveBeenCalled();
  });

  it("更新後の状態の取得に失敗したら500を返す", async () => {
    vi.mocked(fetchUserEmailOptOutAt).mockResolvedValue({
      data: null,
      error: { message: "db error" } as never,
    });

    const res = await PATCH(request({ promotionalEmails: false }));

    expect(res.status).toBe(500);
  });
});
