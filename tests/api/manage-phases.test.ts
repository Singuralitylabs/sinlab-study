import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");

import { PUT } from "@/app/api/manage/phases/[id]/route";
import { POST } from "@/app/api/manage/phases/route";
import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
import { createPhase, updatePhase } from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid-maintainer" },
  userId: 1,
  userStatus: "active",
  userRole: "maintainer",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/manage/phases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createPhase).mockResolvedValue({ data: { id: 1 } as never, error: null });
  vi.mocked(updatePhase).mockResolvedValue({ error: null });
});

describe("POST /api/manage/phases - バリデーション", () => {
  it.each([
    ["theme_id未指定", { name: "フェーズ1", insert_after_id: null }],
    ["name未指定", { theme_id: 1, insert_after_id: null }],
    ["theme_idが0以下", { theme_id: 0, name: "フェーズ1", insert_after_id: null }],
    ["insert_after_id未指定", { theme_id: 1, name: "フェーズ1" }],
  ])("%sの場合は400で、作成処理を呼ばない", async (_label, body) => {
    const res = await POST(request(body) as never);

    expect(res.status).toBe(400);
    expect(createPhase).not.toHaveBeenCalled();
  });

  it("正常な入力は200で、insertAfterIdとして作成処理へ渡す", async () => {
    const res = await POST(
      request({ theme_id: 1, name: "フェーズ1", insert_after_id: 2 }) as never
    );

    expect(res.status).toBe(200);
    expect(createPhase).toHaveBeenCalledWith(
      expect.objectContaining({ theme_id: 1, name: "フェーズ1", insertAfterId: 2 })
    );
  });
});

describe("PUT /api/manage/phases/[id] - バリデーション", () => {
  const params = Promise.resolve({ id: "1" });

  it("空オブジェクトでも200（全項目任意）", async () => {
    const res = await PUT(request({}) as never, { params });

    expect(res.status).toBe(200);
  });

  it("theme_idに文字列を指定した場合は400", async () => {
    const res = await PUT(request({ theme_id: "1" }) as never, { params });

    expect(res.status).toBe(400);
    expect(updatePhase).not.toHaveBeenCalled();
  });

  it("insert_after_idを指定した場合、insertAfterIdとして更新処理へ渡す", async () => {
    const res = await PUT(request({ theme_id: 1, insert_after_id: 2 }) as never, { params });

    expect(res.status).toBe(200);
    expect(updatePhase).toHaveBeenCalledWith(1, expect.objectContaining({ insertAfterId: 2 }));
  });

  it("updatePhaseがInvalidInsertAfterIdErrorを投げた場合は400", async () => {
    vi.mocked(updatePhase).mockRejectedValue(new InvalidInsertAfterIdError(999));

    const res = await PUT(request({ theme_id: 1, insert_after_id: 999 }) as never, { params });

    expect(res.status).toBe(400);
  });
});
