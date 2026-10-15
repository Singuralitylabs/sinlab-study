import { describe, expect, it } from "vitest";
import {
  addCodeFile,
  buildInitialCodeFiles,
  changeCodeFileLanguage,
  parseStarterFiles,
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

  it("ファイル名の無い行は保存対象外（null でクリア）", () => {
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
    ).toBeNull();
  });
});

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
