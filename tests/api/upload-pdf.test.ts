import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/auth/server-auth");
vi.mock("@/app/services/api/supabase-server");

import { GET, POST } from "@/app/api/upload-pdf/route";
import { SLIDE_NUMBER_MAX } from "@/app/constants/slides";
import { createAdminSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";

const invalidSlideNumberMessage = `スライド番号は1以上${SLIDE_NUMBER_MAX}以下の整数を指定してください`;
const slideNumberExhaustedMessage = `自動採番できる番号の上限（${SLIDE_NUMBER_MAX}）に達しました。スライド番号を指定してください`;

const maintainerAuth = {
  user: { id: "auth-uuid" },
  userId: 5,
  userStatus: "active",
  userRole: "maintainer",
};

interface MockStorageOptions {
  files?: { name: string }[];
  listError?: unknown;
  /** Top-level folders of the bucket (entries without an id, as storage-js returns them). */
  folders?: string[];
  rootListError?: unknown;
  uploadError?: unknown;
  /**
   * data returned by upload() (built from the saved key when omitted; null reproduces "data: null
   * without an error").
   */
  uploadData?: { path: string; fullPath: string } | null;
  /** Result of exists(); an Error is thrown as-is (reproduces failures other than 400/404). */
  exists?: boolean | Error;
}

const mockStorage = (options: MockStorageOptions = {}) => {
  const {
    files = [],
    listError = null,
    folders = ["gas-advanced"],
    rootListError = null,
    uploadError = null,
    exists: existsResult = true,
  } = options;

  const list = vi.fn().mockImplementation(async (path: string) => {
    if (path === "") {
      return {
        data: rootListError ? null : folders.map((name) => ({ name, id: null })),
        error: rootListError,
      };
    }
    return { data: listError ? null : files, error: listError };
  });

  const upload = vi.fn().mockImplementation(async (path: string) => {
    if (uploadError) {
      return { data: null, error: uploadError };
    }
    // Respect null (reproduces data: null) but fall back to the default build for undefined.
    const data =
      options.uploadData !== undefined
        ? options.uploadData
        : { id: "object-id", path, fullPath: `slides/${path}` };
    return { data, error: null };
  });

  const exists = vi.fn().mockImplementation(async () => {
    if (existsResult instanceof Error) {
      throw existsResult;
    }
    return { data: existsResult, error: null };
  });

  // The upload API never issues delivery URLs (public/signed; #89); URL-generating methods are left
  // out of the mock so a call fails the test.
  const storage = { from: vi.fn().mockReturnValue({ list, upload, exists }) };
  vi.mocked(createAdminSupabaseClient).mockResolvedValue({ storage } as never);
  return { list, upload, exists };
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

// Restore only the Date.now spy, not the console.error spy installed by tests/setup.ts.
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
  // Ensures Number.parseInt's partial parsing can't let an invalid string overwrite an existing
  // PDF.
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
      error: invalidSlideNumberMessage,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("ファイルパートで送られたスライド番号も400で拒否する", async () => {
    const { upload } = mockStorage();

    const response = await POST(
      request({ slideNumber: new File(["1"], "n.txt", { type: "text/plain" }) }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: invalidSlideNumberMessage,
    });
    expect(upload).not.toHaveBeenCalled();
  });

  const validNumbers = [
    ["1", "gas-advanced/slide-01.pdf"],
    ["01", "gas-advanced/slide-01.pdf"],
    ["12", "gas-advanced/slide-12.pdf"],
    ["100", "gas-advanced/slide-100.pdf"],
    [String(SLIDE_NUMBER_MAX), `gas-advanced/slide-${SLIDE_NUMBER_MAX}.pdf`],
  ] as const;

  it.each(validNumbers)("%j は受理し %s へ上書き保存する", async (value, expectedPath) => {
    const { list, upload, exists } = mockStorage();

    const response = await POST(request({ slideNumber: value }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: expectedPath });
    expect(upload).toHaveBeenCalledWith(expectedPath, expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: true,
    });
    // Only the top-level folder check may list; the folder's files are not scanned for numbering.
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith("", expect.anything());
    expect(exists).toHaveBeenCalledWith(expectedPath);
  });

  it("明示的に送られた空文字は400で拒否する（自動採番はフィールド省略時のみ）", async () => {
    const { list, upload } = mockStorage({ files: [{ name: "slide-03.pdf" }] });

    const response = await POST(request({ slideNumber: "" }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: invalidSlideNumberMessage,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it(`上限（${SLIDE_NUMBER_MAX}）+1 は400で拒否し、アップロードしない`, async () => {
    const { list, upload } = mockStorage();

    const response = await POST(request({ slideNumber: String(SLIDE_NUMBER_MAX + 1) }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: invalidSlideNumberMessage,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
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

  it("安全な整数の上限のファイル名は採番の基準にしない（ドメイン上限を超えるため）", async () => {
    const { upload } = mockStorage({
      files: [{ name: `slide-${Number.MAX_SAFE_INTEGER}.pdf` }],
    });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledWith("gas-advanced/slide-01.pdf", expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it(`上限（${SLIDE_NUMBER_MAX}）に達している場合は400を返し、アップロードしない`, async () => {
    const { upload } = mockStorage({
      files: [{ name: `slide-${SLIDE_NUMBER_MAX}.pdf` }],
    });

    const response = await POST(request() as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: slideNumberExhaustedMessage,
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it(`上限超過のファイル名は採番の基準にしない（${SLIDE_NUMBER_MAX}+1 があっても次は上限内で採番する）`, async () => {
    const { upload } = mockStorage({
      files: [{ name: "slide-02.pdf" }, { name: `slide-${SLIDE_NUMBER_MAX + 1}.pdf` }],
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

  // storage-js returns { status: 409, statusCode: "409" } on duplicates ("Duplicate" is only in
  // message).
  it.each([
    ["status と statusCode の両方", { status: 409, statusCode: "409" }],
    ["statusCode のみ", { statusCode: "409" }],
  ])(
    "採番した番号が既に存在した場合（409・%s）は重複と分かるメッセージを返す",
    async (_label, uploadError) => {
      mockStorage({ uploadError });

      const response = await POST(request() as never);

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "同じ番号のスライドが既に存在します。番号を指定して上書きしてください",
      });
    }
  );

  it("重複以外のアップロード失敗は汎用メッセージを返す", async () => {
    mockStorage({ uploadError: { status: 500, statusCode: "InternalError" } });

    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "アップロードに失敗しました" });
  });
});

describe("POST /api/upload-pdf 保存先フォルダの存在確認 (#440)", () => {
  const withCreateFolder = (folder: string, createFolder?: string) => {
    const formData = new FormData();
    formData.append("file", pdf());
    formData.append("folder", folder);
    if (createFolder !== undefined) formData.append("createFolder", createFolder);
    return new Request("http://localhost/api/upload-pdf", { method: "POST", body: formData });
  };

  it("存在しないフォルダは、新規作成の明示がなければ400で拒否する（タイプミス対策）", async () => {
    const { upload } = mockStorage({ folders: ["gas-advanced"] });

    const response = await POST(withCreateFolder("gas-advanc") as never);

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("番号を明示した上書きでも、存在しないフォルダは400で拒否する", async () => {
    const { upload } = mockStorage();
    const formData = new FormData();
    formData.append("file", pdf());
    formData.append("folder", "gas-advanc");
    formData.append("slideNumber", "1");

    const response = await POST(
      new Request("http://localhost/api/upload-pdf", { method: "POST", body: formData }) as never
    );

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("createFolder=true なら存在しないフォルダにも作成できる", async () => {
    const { upload } = mockStorage({ folders: [] });

    const response = await POST(withCreateFolder("new-course", "true") as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: "new-course/slide-01.pdf" });
    expect(upload).toHaveBeenCalledOnce();
  });

  it("createFolder が true 以外の値なら新規作成として扱わない", async () => {
    const { upload } = mockStorage({ folders: [] });

    const response = await POST(withCreateFolder("new-course", "1") as never);

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it("フォルダ一覧の取得に失敗したら500を返し、アップロードしない", async () => {
    const { upload } = mockStorage({ rootListError: { message: "boom" } });

    const response = await POST(request() as never);

    expect(response.status).toBe(500);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("GET /api/upload-pdf フォルダ一覧", () => {
  it("フォルダ（idなしのエントリ）だけを返し、直下のファイルは含めない", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        { name: "gas-advanced", id: null },
        { name: "web-dev", id: null },
        { name: "123_legacy.pdf", id: "object-id" },
      ],
      error: null,
    });
    vi.mocked(createAdminSupabaseClient).mockResolvedValue({
      storage: { from: vi.fn().mockReturnValue({ list }) },
    } as never);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ folders: ["gas-advanced", "web-dev"] });
  });

  it("権限のないロールは403で拒否する", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ ...maintainerAuth, userRole: "member" } as never);
    mockStorage();

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("未認証は401で拒否する", async () => {
    vi.mocked(getServerAuth).mockResolvedValue({ user: null } as never);

    const response = await GET();

    expect(response.status).toBe(401);
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

describe("POST /api/upload-pdf アップロード後の存在確認", () => {
  const verifyFailed = (path: string) =>
    `アップロードの完了を確認できませんでした（${path}）。時間をおいて再度お試しください`;

  it("エラー無しで data: null が返った場合は失敗扱いとし、キーを返さない", async () => {
    const { exists } = mockStorage({ uploadData: null });

    const response = await POST(request({ slideNumber: "1" }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: verifyFailed("gas-advanced/slide-01.pdf"),
      path: "gas-advanced/slide-01.pdf",
    });
    expect(exists).not.toHaveBeenCalled();
  });

  // path is merely built from the argument by storage-js, so verify with the server-derived
  // fullPath.
  it("upload() が想定と異なる fullPath を返した場合は失敗扱いとし、キーを返さない", async () => {
    const { exists } = mockStorage({
      uploadData: {
        path: "gas-advanced/slide-01.pdf",
        fullPath: "slides/gas-advanced/slide-99.pdf",
      },
    });

    const response = await POST(request({ slideNumber: "1" }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: verifyFailed("gas-advanced/slide-01.pdf"),
      path: "gas-advanced/slide-01.pdf",
    });
    expect(exists).not.toHaveBeenCalled();
  });

  it("バケット名の異なる fullPath も失敗扱いにする", async () => {
    mockStorage({
      uploadData: {
        path: "gas-advanced/slide-01.pdf",
        fullPath: "other/gas-advanced/slide-01.pdf",
      },
    });

    const response = await POST(request({ slideNumber: "1" }) as never);

    expect(response.status).toBe(500);
  });

  it("存在確認が false を返した場合はキーを返さない", async () => {
    mockStorage({ exists: false });

    const response = await POST(request({ slideNumber: "1" }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: verifyFailed("gas-advanced/slide-01.pdf"),
      path: "gas-advanced/slide-01.pdf",
    });
  });

  // exists() throws on failures other than 400/404 (500, network loss).
  it("存在確認が例外を投げた場合もキーを返さない", async () => {
    mockStorage({ exists: new Error("network down") });

    const response = await POST(request({ slideNumber: "1" }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: verifyFailed("gas-advanced/slide-01.pdf"),
      path: "gas-advanced/slide-01.pdf",
    });
  });

  it("自動採番時は採番したキーで存在確認を行う", async () => {
    const { exists } = mockStorage({ files: [{ name: "slide-04.pdf" }] });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(exists).toHaveBeenCalledWith("gas-advanced/slide-05.pdf");
  });

  it("フォルダ未指定（バケット直下）でも存在確認を行う", async () => {
    freezeNow(1723500000);
    const { exists } = mockStorage();

    const response = await POST(request({ folder: null }) as never);

    expect(response.status).toBe(200);
    expect(exists).toHaveBeenCalledWith("1723500000_slide.pdf");
  });
});
