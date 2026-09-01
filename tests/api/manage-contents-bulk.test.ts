import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");

import { PATCH } from "@/app/api/manage/contents/bulk/route";
import { bulkUpdateContents } from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid-maintainer" },
  userId: 1,
  userStatus: "active",
  userRole: "maintainer",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/manage/contents/bulk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(bulkUpdateContents).mockResolvedValue({ error: null, updated: 3 });
});

describe("PATCH /api/manage/contents/bulk - 認可", () => {
  it("未認証は401で、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(401);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("userIdなしは403で、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: { id: "auth-uuid" },
      userId: null,
      userStatus: "active",
      userRole: "maintainer",
    } as never);

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(403);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("rejectedユーザーは403で、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...maintainerAuth,
      userStatus: "rejected",
    } as never);

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(403);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("コンテンツ管理権限のないロール（member）は403で、更新処理を呼ばない", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      ...maintainerAuth,
      userRole: "member",
    } as never);

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(403);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/manage/contents/bulk - バリデーション", () => {
  it("リクエストボディがnullの場合は400", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/manage/contents/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "null",
      })
    );

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("idsが空配列の場合は400", async () => {
    const res = await PATCH(request({ ids: [], action: "publish" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("idsに0以下・小数など不正な値を含む場合は400", async () => {
    const res = await PATCH(request({ ids: [1, -1], action: "publish" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("idsが100件を超える場合は400", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);

    const res = await PATCH(request({ ids, action: "publish" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("idsがちょうど100件の場合は許可される", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => i + 1);

    const res = await PATCH(request({ ids, action: "publish" }));

    expect(res.status).toBe(200);
    expect(bulkUpdateContents).toHaveBeenCalledWith(ids, { is_published: true });
  });

  it("actionがホワイトリスト外の場合は400", async () => {
    const res = await PATCH(request({ ids: [1], action: "archive" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("set_typeでcontentTypeが未指定の場合は400", async () => {
    const res = await PATCH(request({ ids: [1], action: "set_type" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });

  it("set_typeでcontentTypeが不正な値の場合は400", async () => {
    const res = await PATCH(request({ ids: [1], action: "set_type", contentType: "quiz" }));

    expect(res.status).toBe(400);
    expect(bulkUpdateContents).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/manage/contents/bulk - action→patchマッピング", () => {
  it.each([
    ["publish", { is_published: true }],
    ["unpublish", { is_published: false }],
    ["open_trial", { is_open_to_trial: true }],
    ["close_trial", { is_open_to_trial: false }],
    ["delete", { is_deleted: true }],
  ] as const)("%s は %o を渡す", async (action, expectedPatch) => {
    const res = await PATCH(request({ ids: [1, 2, 3], action }));

    expect(res.status).toBe(200);
    expect(bulkUpdateContents).toHaveBeenCalledWith([1, 2, 3], expectedPatch);
    await expect(res.json()).resolves.toEqual({ success: true, updated: 3 });
  });

  it("set_typeはcontentTypeをcontent_typeとして渡す", async () => {
    const res = await PATCH(request({ ids: [1, 2], action: "set_type", contentType: "exercise" }));

    expect(res.status).toBe(200);
    expect(bulkUpdateContents).toHaveBeenCalledWith([1, 2], { content_type: "exercise" });
  });
});

describe("PATCH /api/manage/contents/bulk - 更新失敗", () => {
  it("bulkUpdateContentsがエラーを返した場合は500", async () => {
    vi.mocked(bulkUpdateContents).mockResolvedValue({
      error: { message: "db error", code: "PGRST204" } as never,
      updated: 0,
    });

    const res = await PATCH(request({ ids: [1], action: "publish" }));

    expect(res.status).toBe(500);
  });
});
