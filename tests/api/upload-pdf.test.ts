import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

interface MockStorageOptions {
  files?: { name: string }[];
  listError?: unknown;
  uploadError?: unknown;
}

/** Storageのモックを作り、createAdminSupabaseClient() の戻り値として登録する */
const mockStorage = ({
  files = [],
  listError = null,
  uploadError = null,
}: MockStorageOptions = {}) => {
  const list = vi.fn().mockResolvedValue({ data: listError ? null : files, error: listError });
  const upload = vi.fn().mockResolvedValue({ error: uploadError });
  const getPublicUrl = vi.fn().mockImplementation((path: string) => ({
    data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/slides/${path}` },
  }));
  const storage = { from: vi.fn().mockReturnValue({ list, upload, getPublicUrl }) };
  vi.mocked(createAdminSupabaseClient).mockResolvedValue({ storage } as never);
  return { list, upload };
};

const pdf = () => new File(["%PDF-1.4"], "slide.pdf", { type: "application/pdf" });

const request = ({
  file = pdf(),
  folder = "gas-advanced",
  slideNumber,
}: {
  file?: File | null;
  folder?: string | File | null;
  slideNumber?: string | File;
} = {}) => {
  const formData = new FormData();
  if (file) formData.append("file", file);
  if (folder !== null) formData.append("folder", folder);
  if (slideNumber !== undefined) formData.append("slideNumber", slideNumber);
  return new Request("http://localhost/api/upload-pdf", { method: "POST", body: formData });
};

// tests/setup.ts が張る console.error のスパイまで戻さないよう、Date.now のスパイのみ局所的に復元する
let nowSpy: ReturnType<typeof vi.spyOn> | undefined;

const freezeNow = (value: number) => {
  nowSpy = vi.spyOn(Date, "now").mockReturnValue(value);
};

beforeEach(() => {
  vi.mocked(getServerAuth).mockResolvedValue(maintainerAuth as never);
});

afterEach(() => {
  nowSpy?.mockRestore();
  nowSpy = undefined;
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
    const { list, upload } = mockStorage();

    const response = await POST(request({ slideNumber: value }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "スライド番号は1以上の整数を指定してください",
    });
    expect(upload).not.toHaveBeenCalled();
    // 番号指定時は自動採番の一覧取得へ回らない
    expect(list).not.toHaveBeenCalled();
  });

  it("ファイルパートで送られたスライド番号も400で拒否する", async () => {
    const { upload } = mockStorage();

    const response = await POST(
      request({ slideNumber: new File(["1"], "n.txt", { type: "text/plain" }) }) as never
    );

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
    const { list, upload } = mockStorage();

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
    // 番号指定時は自動採番の一覧取得を行わない
    expect(list).not.toHaveBeenCalled();
  });

  it("空文字の番号は未指定として扱い、自動採番へ回す", async () => {
    const { upload } = mockStorage({ files: [{ name: "slide-03.pdf" }] });

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
    const { upload } = mockStorage({
      files: [{ name: "slide-01.pdf" }, { name: "slide-09.pdf" }, { name: "notes.txt" }],
    });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-10.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("既存ファイルが無ければ slide-01.pdf から始める", async () => {
    const { upload } = mockStorage();

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-01.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("slide-00.pdf は採番に影響しない", async () => {
    const { upload } = mockStorage({ files: [{ name: "slide-00.pdf" }] });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-01.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("桁あふれしたファイル名は採番の基準にしない", async () => {
    const { upload } = mockStorage({
      files: [{ name: "slide-02.pdf" }, { name: "slide-99999999999999999999.pdf" }],
    });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-03.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("一覧取得に失敗したら500を返し、アップロードしない", async () => {
    const { upload } = mockStorage({ listError: { message: "boom" } });

    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "スライド一覧の取得に失敗しました。時間をおいて再度お試しください",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("採番した番号が既に存在した場合（409）は重複と分かるメッセージを返す", async () => {
    mockStorage({ uploadError: { status: 409, statusCode: "Duplicate" } });

    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "同じ番号のスライドが既に存在します。番号を指定して上書きしてください",
    });
  });

  it("重複以外のアップロード失敗は汎用メッセージを返す", async () => {
    mockStorage({ uploadError: { status: 500, statusCode: "InternalError" } });

    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "アップロードに失敗しました" });
  });
});

describe("POST /api/upload-pdf その他の入力検証", () => {
  it("フォルダ未指定時はタイムスタンプ付きのキーで保存する", async () => {
    freezeNow(1723500000);
    const { upload } = mockStorage();

    const response = await POST(request({ folder: null }) as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("1723500000_slide.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("フォルダ未指定時はスライド番号を検証しない（後方互換）", async () => {
    freezeNow(1723500000);
    const { upload } = mockStorage();

    const response = await POST(request({ folder: null, slideNumber: "1abc" }) as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("1723500000_slide.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("不正なフォルダ名は400で拒否する", async () => {
    const { upload } = mockStorage();

    const response = await POST(request({ folder: "gas_advanced" }) as never);

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("ファイルパートで送られたフォルダ名は500ではなく400で拒否する", async () => {
    const { upload } = mockStorage();

    const response = await POST(
      request({ folder: new File(["gas"], "f.txt", { type: "text/plain" }) }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "フォルダ名は英小文字・数字・ハイフンのみ使用できます",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("権限のないロールは403で拒否する", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...maintainerAuth, userRole: "member" } as never);
    const { upload } = mockStorage();

    const response = await POST(request({ slideNumber: "1" }) as never);

    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });
});
