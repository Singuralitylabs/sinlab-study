import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");

import { PUT } from "@/app/api/manage/weeks/[id]/route";
import { POST } from "@/app/api/manage/weeks/route";
import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
import { createWeek, updateWeek } from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid-maintainer" },
  userId: 1,
  userStatus: "active",
  userRole: "maintainer",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/manage/weeks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createWeek).mockResolvedValue({ data: { id: 1 } as never, error: null });
  vi.mocked(updateWeek).mockResolvedValue({ error: null });
});

describe("POST /api/manage/weeks - バリデーション", () => {
  it.each([
    ["phase_id未指定", { name: "週1", insert_after_id: null }],
    ["name未指定", { phase_id: 1, insert_after_id: null }],
    ["insert_after_id未指定", { phase_id: 1, name: "週1" }],
  ])("%sの場合は400で、作成処理を呼ばない", async (_label, body) => {
    const res = await POST(request(body) as never);

    expect(res.status).toBe(400);
    expect(createWeek).not.toHaveBeenCalled();
  });

  it("正常な入力は200で、insertAfterIdとして作成処理へ渡す", async () => {
    const res = await POST(request({ phase_id: 1, name: "週1", insert_after_id: null }) as never);

    expect(res.status).toBe(200);
    expect(createWeek).toHaveBeenCalledWith(
      expect.objectContaining({ phase_id: 1, name: "週1", insertAfterId: null })
    );
  });
});

describe("PUT /api/manage/weeks/[id] - バリデーション", () => {
  const params = Promise.resolve({ id: "1" });

  it("空オブジェクトでも200（全項目任意）", async () => {
    const res = await PUT(request({}) as never, { params });

    expect(res.status).toBe(200);
  });

  it("nameが空文字の場合は400", async () => {
    const res = await PUT(request({ name: "" }) as never, { params });

    expect(res.status).toBe(400);
    expect(updateWeek).not.toHaveBeenCalled();
  });

  it("insert_after_idを指定した場合、insertAfterIdとして更新処理へ渡す", async () => {
    const res = await PUT(request({ insert_after_id: null }) as never, { params });

    expect(res.status).toBe(200);
    expect(updateWeek).toHaveBeenCalledWith(1, expect.objectContaining({ insertAfterId: null }));
  });

  it("updateWeekがInvalidInsertAfterIdErrorを投げた場合は400", async () => {
    vi.mocked(updateWeek).mockRejectedValue(new InvalidInsertAfterIdError(999));

    const res = await PUT(request({ insert_after_id: 999 }) as never, { params });

    expect(res.status).toBe(400);
  });
});
