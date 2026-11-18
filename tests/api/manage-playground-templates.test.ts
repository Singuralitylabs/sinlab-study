import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/playground-templates-server");

import { DELETE, PUT } from "@/app/api/manage/playground-templates/[id]/route";
import { POST } from "@/app/api/manage/playground-templates/route";
import { PLAYGROUND_MAX_FILE_LENGTH } from "@/app/constants/playground";
import {
  createPlaygroundTemplate,
  deletePlaygroundTemplate,
  updatePlaygroundTemplate,
} from "@/app/services/api/playground-templates-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const body = {
  title: "体験会: ボタンを押すと色が変わる",
  kind: "web",
  files: [
    { filename: "index.html", content: "<button>押す</button>" },
    { filename: "script.js", content: "console.log(1);" },
  ],
  is_published: true,
};

function auth(userRole: string | null, overrides: Record<string, unknown> = {}) {
  vi.mocked(getServerAuth).mockResolvedValue({
    user: { sub: "auth-uuid" },
    userId: 9,
    userStatus: "active",
    userRole,
    ...overrides,
  } as never);
}

function jsonRequest(method: string, payload: unknown) {
  return new NextRequest("https://study.example.com/api/manage/playground-templates", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createPlaygroundTemplate).mockResolvedValue({ data: { id: 1 }, error: null });
  vi.mocked(updatePlaygroundTemplate).mockResolvedValue({ error: null, notFound: false });
  vi.mocked(deletePlaygroundTemplate).mockResolvedValue({ error: null, notFound: false });
});

describe("コードを試す ひな形管理 API の権限", () => {
  it("未認証は 401", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({
      user: null,
      userId: null,
      userStatus: null,
      userRole: null,
    } as never);

    expect((await POST(jsonRequest("POST", body))).status).toBe(401);
    expect((await PUT(jsonRequest("PUT", body), params("1"))).status).toBe(401);
    expect((await DELETE(jsonRequest("DELETE", {}), params("1"))).status).toBe(401);
    expect(createPlaygroundTemplate).not.toHaveBeenCalled();
  });

  it("受講生（member）・お試し・却下ユーザーは 403 で、何も変更しない", async () => {
    auth("member");
    expect((await POST(jsonRequest("POST", body))).status).toBe(403);
    expect((await PUT(jsonRequest("PUT", body), params("1"))).status).toBe(403);
    expect((await DELETE(jsonRequest("DELETE", {}), params("1"))).status).toBe(403);

    auth("member", { userStatus: "trial" });
    expect((await POST(jsonRequest("POST", body))).status).toBe(403);

    auth("admin", { userStatus: "rejected" });
    expect((await POST(jsonRequest("POST", body))).status).toBe(403);

    expect(createPlaygroundTemplate).not.toHaveBeenCalled();
    expect(updatePlaygroundTemplate).not.toHaveBeenCalled();
    expect(deletePlaygroundTemplate).not.toHaveBeenCalled();
  });

  it.each(["admin", "maintainer"])("%s は作成・更新・削除できる", async (role) => {
    auth(role);

    expect((await POST(jsonRequest("POST", body))).status).toBe(200);
    expect(createPlaygroundTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ title: body.title, kind: "web" }),
      9
    );
    expect((await PUT(jsonRequest("PUT", body), params("3"))).status).toBe(200);
    expect(updatePlaygroundTemplate).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ is_published: true })
    );
    expect((await DELETE(jsonRequest("DELETE", {}), params("3"))).status).toBe(200);
    expect(deletePlaygroundTemplate).toHaveBeenCalledWith(3);
  });
});

describe("コードを試す ひな形管理 API の入力検証", () => {
  beforeEach(() => auth("admin"));

  it.each([
    ["種類に合わない拡張子", { ...body, kind: "python" }, "この種類で使える拡張子"],
    ["実行できない種類", { ...body, kind: "bash" }, "実行の種類が正しくありません"],
    [
      "フォルダを含むファイル名",
      { ...body, files: [{ filename: "../index.html", content: "" }] },
      "フォルダは使えません",
    ],
    [
      "同じ名前のファイル",
      {
        ...body,
        files: [
          { filename: "index.html", content: "" },
          { filename: "INDEX.html", content: "" },
        ],
      },
      "すでにあります",
    ],
    [
      "大きすぎるファイル",
      {
        ...body,
        files: [{ filename: "index.html", content: "a".repeat(PLAYGROUND_MAX_FILE_LENGTH + 1) }],
      },
      "長すぎます",
    ],
    ["ファイルなし", { ...body, files: [] }, "ファイルを1つ以上"],
  ])("%s は 400 で、保存しない", async (_label, payload, message) => {
    const res = await POST(jsonRequest("POST", payload));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(message);
    expect(createPlaygroundTemplate).not.toHaveBeenCalled();
  });

  it("不正な ID は 400、存在しない ID は 404", async () => {
    expect((await PUT(jsonRequest("PUT", body), params("abc"))).status).toBe(400);
    vi.mocked(updatePlaygroundTemplate).mockResolvedValue({ error: null, notFound: true });
    expect((await PUT(jsonRequest("PUT", body), params("5"))).status).toBe(404);
    vi.mocked(deletePlaygroundTemplate).mockResolvedValue({ error: null, notFound: true });
    expect((await DELETE(jsonRequest("DELETE", {}), params("5"))).status).toBe(404);
  });
});
