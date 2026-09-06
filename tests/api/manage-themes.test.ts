import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");

import { PUT } from "@/app/api/manage/themes/[id]/route";
import { POST } from "@/app/api/manage/themes/route";
import { createTheme, updateTheme } from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid-maintainer" },
  userId: 1,
  userStatus: "active",
  userRole: "maintainer",
};

const request = (body: unknown, url = "http://localhost/api/manage/themes") =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createTheme).mockResolvedValue({ data: { id: 1 } as never, error: null });
  vi.mocked(updateTheme).mockResolvedValue({ error: null });
});

describe("POST /api/manage/themes - バリデーション", () => {
  it("nameが未指定の場合は400で、作成処理を呼ばない", async () => {
    const res = await POST(request({}) as never);

    expect(res.status).toBe(400);
    expect(createTheme).not.toHaveBeenCalled();
  });

  it("nameが空白のみの場合も、既存の !name チェックと同じ範囲で許可される", async () => {
    const res = await POST(request({ name: "   ", insert_after_id: null }) as never);

    expect(res.status).toBe(200);
    expect(createTheme).toHaveBeenCalledWith(expect.objectContaining({ name: "   " }));
  });

  it("insert_after_idが未指定の場合は400で、作成処理を呼ばない", async () => {
    const res = await POST(request({ name: "テーマ1" }) as never);

    expect(res.status).toBe(400);
    expect(createTheme).not.toHaveBeenCalled();
  });

  it("正常な入力は200で、insertAfterIdとして作成処理へ渡す", async () => {
    const res = await POST(
      request({
        name: "テーマ1",
        description: "説明",
        insert_after_id: 3,
        is_published: true,
      }) as never
    );

    expect(res.status).toBe(200);
    expect(createTheme).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "テーマ1",
        description: "説明",
        insertAfterId: 3,
        is_published: true,
      })
    );
  });
});

describe("PUT /api/manage/themes/[id] - バリデーション", () => {
  const params = Promise.resolve({ id: "1" });

  it("空オブジェクトでも200（全項目任意）", async () => {
    const res = await PUT(request({}) as never, { params });

    expect(res.status).toBe(200);
    expect(updateTheme).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it("nameを指定する場合は空文字を許容せず400", async () => {
    const res = await PUT(request({ name: "" }) as never, { params });

    expect(res.status).toBe(400);
    expect(updateTheme).not.toHaveBeenCalled();
  });

  it("IDが数値でない場合は400", async () => {
    const res = await PUT(request({}) as never, { params: Promise.resolve({ id: "abc" }) });

    expect(res.status).toBe(400);
    expect(updateTheme).not.toHaveBeenCalled();
  });
});
