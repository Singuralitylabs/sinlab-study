import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/admin-server");

import { PUT } from "@/app/api/manage/contents/[id]/route";
import { POST } from "@/app/api/manage/contents/route";
import { createContent, updateContent } from "@/app/services/api/admin-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid-maintainer" },
  userId: 1,
  userStatus: "active",
  userRole: "maintainer",
};

const request = (body: unknown) =>
  new Request("http://localhost/api/manage/contents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createContent).mockResolvedValue({ data: { id: 1 } as never, error: null });
  vi.mocked(updateContent).mockResolvedValue({ error: null });
});

describe("POST /api/manage/contents - バリデーション", () => {
  it.each([
    ["title未指定", { week_id: 1, content_type: "video" }],
    ["week_id未指定", { title: "コンテンツ1", content_type: "video" }],
    ["content_type未指定", { title: "コンテンツ1", week_id: 1 }],
  ])("%sの場合は400で、作成処理を呼ばない", async (_label, body) => {
    const res = await POST(request(body) as never);

    expect(res.status).toBe(400);
    expect(createContent).not.toHaveBeenCalled();
  });

  it("content_typeが許可値以外の場合は400（従来はDBのCHECK制約違反で500になっていた）", async () => {
    const res = await POST(
      request({ title: "コンテンツ1", week_id: 1, content_type: "quiz" }) as never
    );

    expect(res.status).toBe(400);
    expect(createContent).not.toHaveBeenCalled();
  });

  it("正常な入力は200で、null項目もそのまま渡す", async () => {
    const res = await POST(
      request({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "video",
        description: null,
      }) as never
    );

    expect(res.status).toBe(200);
    expect(createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "video",
        description: null,
      })
    );
  });

  it("allowed_submission_typesが許可値以外の場合は400", async () => {
    const res = await POST(
      request({
        title: "コンテンツ1",
        week_id: 1,
        content_type: "exercise",
        allowed_submission_types: "email",
      }) as never
    );

    expect(res.status).toBe(400);
    expect(createContent).not.toHaveBeenCalled();
  });
});

describe("PUT /api/manage/contents/[id] - バリデーション", () => {
  const params = Promise.resolve({ id: "1" });

  it("空オブジェクトでも200（全項目任意）", async () => {
    const res = await PUT(request({}) as never, { params });

    expect(res.status).toBe(200);
  });

  it("content_typeを指定する場合は許可値以外を受け付けず400", async () => {
    const res = await PUT(request({ content_type: "quiz" }) as never, { params });

    expect(res.status).toBe(400);
    expect(updateContent).not.toHaveBeenCalled();
  });

  it("IDが数値でない場合は400", async () => {
    const res = await PUT(request({}) as never, { params: Promise.resolve({ id: "abc" }) });

    expect(res.status).toBe(400);
    expect(updateContent).not.toHaveBeenCalled();
  });
});
