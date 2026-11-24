import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");

import { PUT } from "@/app/api/manage/themes/[id]/route";
import { POST } from "@/app/api/manage/themes/route";
import { InvalidInsertAfterIdError } from "@/app/lib/content-grouping";
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

describe("テーマカラー（theme_color）", () => {
  const params = Promise.resolve({ id: "1" });

  it("作成時は大文字にそろえて渡す", async () => {
    const res = await POST(
      request({ name: "テーマ1", insert_after_id: null, theme_color: " #3b77d8 " }) as never
    );

    expect(res.status).toBe(200);
    expect(createTheme).toHaveBeenCalledWith(expect.objectContaining({ theme_color: "#3B77D8" }));
  });

  it.each(["#12345", "3B77D8", "#GGGGGG", "red", 123])(
    "形式外（%s）は400で保存しない",
    async (v) => {
      const res = await PUT(request({ theme_color: v }) as never, { params });

      expect(res.status).toBe(400);
      expect(updateTheme).not.toHaveBeenCalled();
    }
  );

  it.each(["", null])("空（%s）は null（未設定）として渡す", async (v) => {
    const res = await PUT(request({ theme_color: v }) as never, { params });

    expect(res.status).toBe(200);
    expect(updateTheme).toHaveBeenCalledWith(1, expect.objectContaining({ theme_color: null }));
  });

  it("省略したときは undefined（今の値を変えない）", async () => {
    const res = await PUT(request({ name: "テーマ1" }) as never, { params });

    expect(res.status).toBe(200);
    expect(updateTheme).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ theme_color: undefined })
    );
  });
});

describe("準備中として表示（is_coming_soon） (#593)", () => {
  const params = Promise.resolve({ id: "1" });

  it("POST は is_coming_soon を作成処理へ渡す", async () => {
    const res = await POST(
      request({ name: "テーマ1", insert_after_id: null, is_coming_soon: true }) as never
    );

    expect(res.status).toBe(200);
    expect(createTheme).toHaveBeenCalledWith(expect.objectContaining({ is_coming_soon: true }));
  });

  it("PUT は is_coming_soon を更新処理へ渡し、省略時は undefined（今の値を変えない）", async () => {
    await PUT(request({ is_coming_soon: false }) as never, { params });
    expect(updateTheme).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ is_coming_soon: false })
    );

    await PUT(request({ name: "テーマ1" }) as never, { params });
    expect(updateTheme).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ is_coming_soon: undefined })
    );
  });

  it("真偽値でなければ400で、更新処理を呼ばない", async () => {
    const res = await PUT(request({ is_coming_soon: "true" }) as never, { params });

    expect(res.status).toBe(400);
    expect(updateTheme).not.toHaveBeenCalled();
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

  it("insert_after_idを指定した場合、insertAfterIdとして更新処理へ渡す", async () => {
    const res = await PUT(request({ insert_after_id: 3 }) as never, { params });

    expect(res.status).toBe(200);
    expect(updateTheme).toHaveBeenCalledWith(1, expect.objectContaining({ insertAfterId: 3 }));
  });

  it("insert_after_idを省略した場合、insertAfterIdはundefinedとして更新処理へ渡す（表示順を変更しない）", async () => {
    const res = await PUT(request({ name: "テーマ1" }) as never, { params });

    expect(res.status).toBe(200);
    expect(updateTheme).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ insertAfterId: undefined })
    );
  });

  it("updateThemeがInvalidInsertAfterIdErrorを投げた場合は400", async () => {
    vi.mocked(updateTheme).mockRejectedValue(new InvalidInsertAfterIdError(999));

    const res = await PUT(request({ insert_after_id: 999 }) as never, { params });

    expect(res.status).toBe(400);
  });
});
