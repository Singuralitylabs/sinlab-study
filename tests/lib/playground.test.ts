import { describe, expect, it } from "vitest";
import {
  PLAYGROUND_DEFAULT_FILES,
  PLAYGROUND_KINDS,
  PLAYGROUND_MAX_FILE_LENGTH,
  PLAYGROUND_MAX_FILES,
  PLAYGROUND_MAX_TOTAL_LENGTH,
  PLAYGROUND_TEMPLATE_SLUG_PATTERN,
} from "@/app/constants/playground";
import { isPythonLayout, isSqlLayout, resolvePreviewDisplay } from "@/app/lib/html-preview";
import {
  generatePlaygroundTemplateSlug,
  parsePlaygroundDraft,
  playgroundFilenameError,
  playgroundFilesError,
  playgroundLanguageFor,
  playgroundStorageKey,
  serializePlaygroundDraft,
  toPlaygroundCodeFiles,
} from "@/app/lib/playground";

describe("playgroundLanguageFor", () => {
  it("種類ごとの拡張子だけを受け付ける", () => {
    expect(playgroundLanguageFor("web", "index.html")).toBe("html");
    expect(playgroundLanguageFor("web", "App.JSX")).toBe("javascript");
    expect(playgroundLanguageFor("web", "main.py")).toBeNull();
    expect(playgroundLanguageFor("python", "main.py")).toBe("python");
    expect(playgroundLanguageFor("sql", "query.sql")).toBe("sql");
    expect(playgroundLanguageFor("sql", "script.sh")).toBeNull();
  });
});

describe("playgroundFilenameError", () => {
  it.each([
    ["", "入力してください"],
    ["dir/index.html", "フォルダは使えません"],
    ["..\\index.html", "フォルダは使えません"],
    [".env.html", "フォルダは使えません"],
    ["日本語.html", "フォルダは使えません"],
    ["main.py", "使える拡張子"],
    [`${"a".repeat(70)}.html`, "文字以内"],
  ])("%s は %s", (name, message) => {
    expect(playgroundFilenameError("web", name, [])).toContain(message);
  });

  it("大文字小文字だけ違う名前も重複として扱う", () => {
    expect(playgroundFilenameError("web", "Index.html", ["index.html"])).toContain(
      "すでにあります"
    );
    expect(playgroundFilenameError("web", "page.html", ["index.html"])).toBeNull();
  });
});

describe("playgroundFilesError", () => {
  it("既定のファイルはどの種類でも正しい", () => {
    for (const kind of PLAYGROUND_KINDS) {
      expect(playgroundFilesError(kind, PLAYGROUND_DEFAULT_FILES[kind])).toBeNull();
    }
  });

  it("ファイル数・1ファイル・合計の上限を守る", () => {
    const many = Array.from({ length: PLAYGROUND_MAX_FILES + 1 }, (_, i) => ({
      filename: `f${i}.py`,
      content: "",
    }));
    expect(playgroundFilesError("python", many)).toContain(`${PLAYGROUND_MAX_FILES}個まで`);
    expect(
      playgroundFilesError("python", [
        { filename: "main.py", content: "a".repeat(PLAYGROUND_MAX_FILE_LENGTH + 1) },
      ])
    ).toContain("長すぎます");
    const perFile = PLAYGROUND_MAX_FILE_LENGTH;
    const count = Math.ceil(PLAYGROUND_MAX_TOTAL_LENGTH / perFile) + 1;
    const big = Array.from({ length: count }, (_, i) => ({
      filename: `f${i}.py`,
      content: "a".repeat(perFile),
    }));
    expect(playgroundFilesError("python", big)).toContain("合計");
    expect(playgroundFilesError("python", [])).toContain("1つもありません");
  });
});

describe("toPlaygroundCodeFiles", () => {
  it("各種類が演習と同じランナーの形になる", () => {
    const web = toPlaygroundCodeFiles("web", PLAYGROUND_DEFAULT_FILES.web);
    expect(resolvePreviewDisplay({ files: web })).toMatchObject({ preview: true, console: true });
    expect(isPythonLayout(toPlaygroundCodeFiles("python", PLAYGROUND_DEFAULT_FILES.python))).toBe(
      true
    );
    expect(isSqlLayout(toPlaygroundCodeFiles("sql", PLAYGROUND_DEFAULT_FILES.sql))).toBe(true);
  });
});

describe("下書きの保存", () => {
  it("キーにユーザー ID を含め、種類とひな形で分ける", () => {
    expect(playgroundStorageKey(1, { kind: "web" })).not.toBe(
      playgroundStorageKey(2, { kind: "web" })
    );
    expect(playgroundStorageKey(1, { kind: "web" })).not.toBe(
      playgroundStorageKey(1, { kind: "python" })
    );
    expect(playgroundStorageKey(1, { templateSlug: "abcdefghij" })).toContain("abcdefghij");
  });

  it("保存した内容を読み戻せる", () => {
    const files = [{ filename: "main.py", content: "print(1)" }];
    expect(parsePlaygroundDraft("python", serializePlaygroundDraft(files))).toEqual(files);
  });

  it.each([
    null,
    "",
    "not json",
    "{}",
    '[{"filename": 1, "content": ""}]',
    '[{"filename": "main.py"}]',
    "[]",
    '[{"filename": "index.html", "content": ""}]',
  ])("壊れた・種類の違う下書き %s は無視する", (raw) => {
    expect(parsePlaygroundDraft("python", raw)).toBeNull();
  });
});

describe("generatePlaygroundTemplateSlug", () => {
  it("決まった形のランダム文字列を返す", () => {
    const slugs = new Set(Array.from({ length: 50 }, () => generatePlaygroundTemplateSlug()));
    expect(slugs.size).toBe(50);
    for (const slug of slugs) {
      expect(slug).toMatch(PLAYGROUND_TEMPLATE_SLUG_PATTERN);
    }
  });

  it("偏りを避けるため 252 以上のバイトは捨てる", () => {
    let call = 0;
    const slug = generatePlaygroundTemplateSlug((length) => {
      call++;
      return new Uint8Array(length).fill(call === 1 ? 255 : 0);
    });
    expect(slug).toBe("aaaaaaaaaa");
    expect(call).toBe(2);
  });
});
