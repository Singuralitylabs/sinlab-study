import { describe, expect, it } from "vitest";
import {
  addCodeFile,
  buildInitialCodeFiles,
  buildSubmissionCodeFiles,
  changeCodeFileLanguage,
  isSubmissionCodeValid,
  isUnchangedFromStarter,
  parseStarterFiles,
  resolveLanguage,
  toStarterFilesPayload,
} from "@/app/lib/code-file-inputs";

describe("buildInitialCodeFiles", () => {
  it("starter が無いときは空ファイル1つ（既存挙動）", () => {
    expect(buildInitialCodeFiles(null, "javascript")).toEqual([
      {
        id: "file-0",
        filename: "",
        language: "javascript",
        content: "",
        filenameEdited: false,
      },
    ]);
  });

  it("starter があるときはファイル名・言語・内容を保持する", () => {
    const files = buildInitialCodeFiles(
      [{ filename: "index.html", language: "html", content: "<div></div>" }],
      "javascript"
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      filename: "index.html",
      language: "html",
      content: "<div></div>",
      filenameEdited: true,
    });
  });

  it("filenameEdited オプションで管理画面向けに常に true にできる", () => {
    const files = buildInitialCodeFiles(
      [{ filename: "", language: "css", content: "" }],
      "javascript",
      { filenameEdited: true }
    );
    expect(files[0].filenameEdited).toBe(true);
    expect(files[0].language).toBe("css");
  });
});

describe("resolveLanguage", () => {
  it("未知言語は fallback に落とす", () => {
    expect(resolveLanguage("html", "javascript")).toBe("html");
    expect(resolveLanguage("cobol", "javascript")).toBe("javascript");
  });
});

describe("parseStarterFiles / toStarterFilesPayload", () => {
  it("不正・空は null", () => {
    expect(parseStarterFiles(null)).toBeNull();
    expect(parseStarterFiles([])).toBeNull();
    expect(parseStarterFiles("x")).toBeNull();
  });

  it("配列を CodeFile に正規化する", () => {
    expect(parseStarterFiles([{ filename: "a.js", language: "javascript", content: "1" }])).toEqual(
      [{ filename: "a.js", language: "javascript", content: "1" }]
    );
  });

  it("ファイル名が空で本文がある行はエラーにする", () => {
    expect(
      toStarterFilesPayload([
        {
          id: "1",
          filename: "  ",
          language: "javascript",
          content: "x",
          filenameEdited: false,
        },
      ])
    ).toEqual({ ok: false, error: "初期コードのファイル名を入力してください" });
  });

  it("唯一の行でファイル名が空なら本文が空でもエラーにする", () => {
    expect(
      toStarterFilesPayload([
        {
          id: "1",
          filename: "",
          language: "javascript",
          content: "",
          filenameEdited: false,
        },
      ])
    ).toEqual({ ok: false, error: "初期コードのファイル名を入力してください" });
  });

  it("空配列は null（クリア）", () => {
    expect(toStarterFilesPayload([])).toEqual({ ok: true, files: null });
  });

  it("有効な行だけを保存する", () => {
    expect(
      toStarterFilesPayload([
        {
          id: "1",
          filename: "index.html",
          language: "html",
          content: "<div></div>",
          filenameEdited: true,
        },
        {
          id: "2",
          filename: "",
          language: "css",
          content: "",
          filenameEdited: false,
        },
      ])
    ).toEqual({
      ok: true,
      files: [{ filename: "index.html", language: "html", content: "<div></div>" }],
    });
  });
});

describe("buildSubmissionCodeFiles / isSubmissionCodeValid", () => {
  it("空本文のファイルは提出ペイロードから除く", () => {
    expect(
      buildSubmissionCodeFiles(
        [
          {
            id: "1",
            filename: "index.html",
            language: "html",
            content: "<div></div>",
            filenameEdited: true,
          },
          {
            id: "2",
            filename: "style.css",
            language: "css",
            content: "  ",
            filenameEdited: true,
          },
        ],
        "javascript"
      )
    ).toEqual([{ filename: "index.html", language: "html", content: "<div></div>" }]);
  });

  it("言語もファイル名も既定どおりの1ファイルは legacy 用にメタを落とす", () => {
    expect(
      buildSubmissionCodeFiles(
        [
          {
            id: "1",
            filename: "",
            language: "javascript",
            content: "const x = 1;",
            filenameEdited: false,
          },
        ],
        "javascript"
      )
    ).toEqual([{ filename: "", language: "", content: "const x = 1;" }]);
  });

  it("言語が content.code_language と違う1ファイルはメタを残す", () => {
    expect(
      buildSubmissionCodeFiles(
        [
          {
            id: "1",
            filename: "index.html",
            language: "html",
            content: "<div></div>",
            filenameEdited: true,
          },
        ],
        "javascript"
      )
    ).toEqual([{ filename: "index.html", language: "html", content: "<div></div>" }]);
  });

  it("カスタムファイル名の1ファイルはメタを残す", () => {
    expect(
      buildSubmissionCodeFiles(
        [
          {
            id: "1",
            filename: "app.js",
            language: "javascript",
            content: "const x = 1;",
            filenameEdited: true,
          },
        ],
        "javascript"
      )
    ).toEqual([{ filename: "app.js", language: "javascript", content: "const x = 1;" }]);
  });

  it("全部空なら invalid、一部に本文があれば valid", () => {
    expect(
      isSubmissionCodeValid([
        {
          id: "1",
          filename: "a.js",
          language: "javascript",
          content: "",
          filenameEdited: true,
        },
        {
          id: "2",
          filename: "b.css",
          language: "css",
          content: "",
          filenameEdited: true,
        },
      ])
    ).toBe(false);
    expect(
      isSubmissionCodeValid([
        {
          id: "1",
          filename: "a.js",
          language: "javascript",
          content: "x",
          filenameEdited: true,
        },
        {
          id: "2",
          filename: "b.css",
          language: "css",
          content: "",
          filenameEdited: true,
        },
      ])
    ).toBe(true);
  });
});

describe("isUnchangedFromStarter", () => {
  const snapshot = buildInitialCodeFiles(
    [{ filename: "index.html", language: "html", content: "<div></div>" }],
    "javascript"
  );

  it("初期スナップショットと同一なら true", () => {
    expect(isUnchangedFromStarter(snapshot, snapshot)).toBe(true);
    expect(
      isUnchangedFromStarter(
        snapshot.map((file) => ({ ...file })),
        snapshot
      )
    ).toBe(true);
  });

  it("内容・ファイル名・言語・件数が違えば false、starter 無しは false", () => {
    expect(
      isUnchangedFromStarter([{ ...snapshot[0], content: "<div>edited</div>" }], snapshot)
    ).toBe(false);
    expect(isUnchangedFromStarter([{ ...snapshot[0], filename: "app.html" }], snapshot)).toBe(
      false
    );
    expect(isUnchangedFromStarter([{ ...snapshot[0], language: "javascript" }], snapshot)).toBe(
      false
    );
    expect(isUnchangedFromStarter([...snapshot, createEmptyLike()], snapshot)).toBe(false);
    expect(isUnchangedFromStarter(snapshot, null)).toBe(false);
    expect(isUnchangedFromStarter(snapshot, [])).toBe(false);
  });
});

function createEmptyLike() {
  return {
    id: "extra",
    filename: "style.css",
    language: "css" as const,
    content: "",
    filenameEdited: true,
  };
}

describe("addCodeFile / changeCodeFileLanguage", () => {
  it("単一→複数の切替で空のファイル名に既定名を埋める", () => {
    const next = addCodeFile(
      [
        {
          id: "file-0",
          filename: "",
          language: "javascript",
          content: "const a = 1;",
          filenameEdited: false,
        },
      ],
      "html"
    );
    expect(next).toHaveLength(2);
    expect(next[0].filename).toBe("code.js");
    expect(next[1].filename).toBe("index.html");
    expect(next[1].language).toBe("html");
  });

  it("filenameEdited が false のとき言語変更で既定ファイル名が追従する", () => {
    const next = changeCodeFileLanguage(
      [
        {
          id: "file-0",
          filename: "code.js",
          language: "javascript",
          content: "",
          filenameEdited: false,
        },
      ],
      0,
      "python"
    );
    expect(next[0]).toMatchObject({ language: "python", filename: "main.py" });
  });

  it("filenameEdited が true のとき言語変更でもファイル名を変えない", () => {
    const next = changeCodeFileLanguage(
      [
        {
          id: "file-0",
          filename: "app.tsx",
          language: "typescript",
          content: "",
          filenameEdited: true,
        },
      ],
      0,
      "javascript"
    );
    expect(next[0]).toMatchObject({ language: "javascript", filename: "app.tsx" });
  });
});
