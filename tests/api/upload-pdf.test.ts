import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");

import { POST } from "@/app/api/upload-pdf/route";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const maintainerAuth = {
  user: { id: "auth-uuid" },
  userId: 5,
  userStatus: "active",
  userRole: "maintainer",
};

interface MockSupabaseOptions {
  files?: { name: string }[];
  listError?: unknown;
  uploadError?: unknown;
}

const createMockSupabase = ({
  files = [],
  listError = null,
  uploadError = null,
}: MockSupabaseOptions = {}) => {
  const list = vi.fn().mockResolvedValue({ data: listError ? null : files, error: listError });
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const getPublicUrl = vi.fn().mockImplementation((path: string) => ({
    data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/slides/${path}` },
  }));
  const storage = { from: vi.fn().mockReturnValue({ list, upload, getPublicUrl }) };
  return { client: { storage }, list, upload };
};

const pdf = () => new File(["%PDF-1.4"], "slide.pdf", { type: "application/pdf" });

const request = ({
  file = pdf(),
  folder = "gas-advanced",
  slideNumber,
}: {
  file?: File | null;
  folder?: string | null;
  slideNumber?: string;
} = {}) => {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (folder !== null) formData.append("folder", folder);
  if (slideNumber !== undefined) formData.append("slideNumber", slideNumber);
  return new Request("http://localhost/api/upload-pdf", { method: "POST", body: formData });
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
  vi.mocked(createAdminSupabaseClient).mockResolvedValue(createMockSupabase().client as never);
});

describe("POST /api/upload-pdf スライド番号のバリデーション", () => {
  // Number.parseInt() の部分解釈で不正な文字列が既存PDFを上書きしないことを担保する
  const invalidNumbers = [
    ["部分解釈される英字混じり", "1abc"],
    ["小数", "1.5"],
    ["0", "0"],
    ["先頭の空白", " 1"],
    ["末尾の空白", "1 "],
    ["負数", "-1"],
    ["明示的な正符号", "+1"],
    ["空白のみ", " "],
    ["指数表記", "1e2"],
    ["全角数字", "１"],
    ["16進表記", "0x10"],
    ["安全な整数の範囲外", "99999999999999999999"],
  ] as const;

  it.each(invalidNumbers)("%s（%j）は400で拒否し、アップロードしない", async (_label, value) => {
    const { client, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request({ slideNumber: value }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "スライド番号は1以上の整数を指定してください",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  const validNumbers = [
    ["1", "gas-advanced/slide-01.pdf"],
    ["01", "gas-advanced/slide-01.pdf"],
    ["12", "gas-advanced/slide-12.pdf"],
    ["100", "gas-advanced/slide-100.pdf"],
  ] as const;

  it.each(validNumbers)("%j は受理し %s へ上書き保存する", async (value, expectedPath) => {
    const { client, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request({ slideNumber: value }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      path: expectedPath,
      url: `https://project.supabase.co/storage/v1/object/public/slides/${expectedPath}`,
    });
    expect(upload).toHaveBeenCalledWith(expectedPath, expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: true,
    });
  });

  it("空文字の番号は未指定として扱い、自動採番へ回す", async () => {
    const { client, upload } = createMockSupabase({ files: [{ name: "slide-03.pdf" }] });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request({ slideNumber: "" }) as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-04.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });
});

describe("POST /api/upload-pdf 自動採番", () => {
  it("既存の最大番号+1で保存し、上書きは許可しない", async () => {
    const { client, list, upload } = createMockSupabase({
      files: [{ name: "slide-01.pdf" }, { name: "slide-09.pdf" }, { name: "notes.txt" }],
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith("gas-advanced", { limit: 1000 });
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-10.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("既存ファイルが無ければ slide-01.pdf から始める", async () => {
    const { client, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-01.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("桁あふれしたファイル名は採番の基準にしない", async () => {
    const { client, upload } = createMockSupabase({
      files: [{ name: "slide-02.pdf" }, { name: "slide-99999999999999999999.pdf" }],
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-03.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("一覧取得に失敗したら500を返し、アップロードしない", async () => {
    const { client, upload } = createMockSupabase({ listError: { message: "boom" } });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "スライド一覧の取得に失敗しました。時間をおいて再度お試しください",
    });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("POST /api/upload-pdf その他の入力検証", () => {
  it("フォルダ未指定時はタイムスタンプ付きのキーで保存する", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1723500000);
    const { client, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request({ folder: null }) as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("1723500000_slide.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("フォルダ未指定時はスライド番号を検証しない（後方互換）", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1723500000);
    const { client, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request({ folder: null, slideNumber: "1abc" }) as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("1723500000_slide.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("不正なフォルダ名は400で拒否する", async () => {
    const { client, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request({ folder: "gas_advanced" }) as never);

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("権限のないロールは403で拒否する", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...maintainerAuth, userRole: "member" } as never);
    const { client, upload } = createMockSupabase();
    vi.mocked(createAdminSupabaseClient).mockResolvedValue(client as never);

    const response = await POST(request({ slideNumber: "1" }) as never);

    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });
});
