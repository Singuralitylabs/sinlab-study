import { describe, expect, it } from "vitest";
import { DEFAULT_FILENAME_BY_LANGUAGE } from "@/app/components/code-editor-utils";
import {
  buildLockedSubmissionFiles,
  EMPTY_SUBMISSION_FILE_ERROR,
  filesMatchSubmissionFileSlots,
  isDefaultSingleFileSlot,
  parseSubmissionFileSlots,
  resolveSubmissionFileSlots,
  SUBMISSION_FILE_SLOT_MAX_COUNT,
  SUBMISSION_FILE_SLOTS_MISMATCH_ERROR,
  toStoredSubmissionCode,
  toSubmissionSlotPayload,
} from "@/app/lib/submission-file-slots";

const htmlSlot = { filename: "index.html", language: "html" as const };
const jsSlot = { filename: "main.js", language: "javascript" as const };

describe("resolveSubmissionFileSlots", () => {
  it("slots も starter も無いときは code_language の既定ファイル1つ", () => {
    expect(
      resolveSubmissionFileSlots({
        submissionFileSlots: null,
        starterFiles: null,
        codeLanguage: "python",
      })
    ).toEqual([{ filename: DEFAULT_FILENAME_BY_LANGUAGE.python, language: "python" }]);
  });

  it("未知の code_language は javascript の既定ファイルに落とす", () => {
    expect(
      resolveSubmissionFileSlots({ submissionFileSlots: null, codeLanguage: "cobol" })
    ).toEqual([{ filename: DEFAULT_FILENAME_BY_LANGUAGE.javascript, language: "javascript" }]);
  });

  it("slots が NULL で starter_files があるときはそのファイル名・言語", () => {
    expect(
      resolveSubmissionFileSlots({
        submissionFileSlots: null,
        starterFiles: [
          { filename: "index.html", language: "html", content: "<p>" },
          { filename: "main.js", language: "javascript", content: "" },
        ],
        codeLanguage: "javascript",
      })
    ).toEqual([htmlSlot, jsSlot]);
  });

  it("明示した slots は starter_files より優先する", () => {
    expect(
      resolveSubmissionFileSlots({
        submissionFileSlots: [jsSlot],
        starterFiles: [{ filename: "index.html", language: "html", content: "<p>" }],
        codeLanguage: "html",
      })
    ).toEqual([jsSlot]);
  });

  it("壊れた slots は starter、それも無ければ既定ファイルに落とす", () => {
    expect(parseSubmissionFileSlots([{ filename: "", language: "html" }])).toBeNull();
    expect(
      resolveSubmissionFileSlots({
        submissionFileSlots: [{ filename: "a.js", language: "cobol" }],
        starterFiles: [{ filename: "app.py", language: "python", content: "x" }],
        codeLanguage: "javascript",
      })
    ).toEqual([{ filename: "app.py", language: "python" }]);
    expect(
      resolveSubmissionFileSlots({
        submissionFileSlots: "nope",
        codeLanguage: "css",
      })
    ).toEqual([{ filename: DEFAULT_FILENAME_BY_LANGUAGE.css, language: "css" }]);
  });

  it(`ファイル数が ${SUBMISSION_FILE_SLOT_MAX_COUNT} を超える JSON は構成として読まない`, () => {
    const tooMany = Array.from({ length: SUBMISSION_FILE_SLOT_MAX_COUNT + 1 }, (_, index) => ({
      filename: `f${index}.js`,
      language: "javascript",
    }));
    expect(parseSubmissionFileSlots(tooMany)).toBeNull();
  });
});

describe("filesMatchSubmissionFileSlots", () => {
  const slots = [htmlSlot, jsSlot];

  it("数・ファイル名・言語・並び順が一致し、中身があれば受理する", () => {
    const result = filesMatchSubmissionFileSlots(
      [
        { filename: "index.html", language: "html", content: "<p>" },
        { filename: "main.js", language: "javascript", content: "run()" },
      ],
      slots,
      "html"
    );
    expect(result.ok).toBe(true);
  });

  it("空ファイル・件数違い・名前違い・言語違い・順序違いは拒否する", () => {
    expect(
      filesMatchSubmissionFileSlots(
        [
          { filename: "index.html", language: "html", content: "  " },
          { filename: "main.js", language: "javascript", content: "run()" },
        ],
        slots,
        "html"
      )
    ).toEqual({ ok: false, error: EMPTY_SUBMISSION_FILE_ERROR });
    expect(
      filesMatchSubmissionFileSlots(
        [{ filename: "index.html", language: "html", content: "<p>" }],
        slots,
        "html"
      )
    ).toEqual({ ok: false, error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR });
    expect(
      filesMatchSubmissionFileSlots(
        [
          { filename: "page.html", language: "html", content: "<p>" },
          { filename: "main.js", language: "javascript", content: "run()" },
        ],
        slots,
        "html"
      )
    ).toEqual({ ok: false, error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR });
    expect(
      filesMatchSubmissionFileSlots(
        [
          { filename: "index.html", language: "xml", content: "<p>" },
          { filename: "main.js", language: "javascript", content: "run()" },
        ],
        slots,
        "html"
      )
    ).toEqual({ ok: false, error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR });
    expect(
      filesMatchSubmissionFileSlots(
        [
          { filename: "main.js", language: "javascript", content: "run()" },
          { filename: "index.html", language: "html", content: "<p>" },
        ],
        slots,
        "html"
      )
    ).toEqual({ ok: false, error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR });
  });

  it("未指定の既定1ファイルだけ、空のファイル名・言語を既存クライアントとして受理する", () => {
    const resolved = resolveSubmissionFileSlots({
      submissionFileSlots: null,
      codeLanguage: "javascript",
    });
    expect(isDefaultSingleFileSlot(resolved, "javascript")).toBe(true);
    const legacy = filesMatchSubmissionFileSlots(
      [{ filename: "", language: "", content: "const x = 1;" }],
      resolved,
      "javascript"
    );
    expect(legacy.ok).toBe(true);
    if (legacy.ok) {
      expect(toStoredSubmissionCode(legacy.files, "javascript")).toEqual({
        codeContent: "const x = 1;",
        codeFiles: null,
      });
    }
    expect(
      filesMatchSubmissionFileSlots(
        [{ filename: "", language: "", content: "<p>" }],
        [htmlSlot],
        "javascript"
      )
    ).toEqual({ ok: false, error: SUBMISSION_FILE_SLOTS_MISMATCH_ERROR });
  });

  it("既定の単一ファイルは code_content、それ以外は code_files に分ける", () => {
    expect(
      toStoredSubmissionCode(
        [{ filename: "code.js", language: "javascript", content: "const x = 1;" }],
        "javascript"
      )
    ).toEqual({ codeContent: "const x = 1;", codeFiles: null });
    expect(
      toStoredSubmissionCode(
        [{ filename: "page.html", language: "html", content: "<p>" }],
        "javascript"
      )
    ).toEqual({
      codeContent: null,
      codeFiles: [{ filename: "page.html", language: "html", content: "<p>" }],
    });
    expect(
      toStoredSubmissionCode(
        [
          { filename: "index.html", language: "html", content: "<p>" },
          { filename: "main.js", language: "javascript", content: "run()" },
        ],
        "html"
      ).codeFiles
    ).toHaveLength(2);
  });
});

describe("buildLockedSubmissionFiles / toSubmissionSlotPayload", () => {
  it("構成の数だけ初期コードを埋めた固定行を作る", () => {
    const files = buildLockedSubmissionFiles({
      submissionFileSlots: [htmlSlot, jsSlot],
      starterFiles: [
        { filename: "index.html", language: "html", content: "<p>" },
        { filename: "main.js", language: "javascript", content: "" },
      ],
      codeLanguage: "html",
    });
    expect(files.map((file) => [file.filename, file.language, file.content])).toEqual([
      ["index.html", "html", "<p>"],
      ["main.js", "javascript", ""],
    ]);
    expect(files.every((file) => file.filenameEdited)).toBe(true);
  });

  it("ファイル名が空の初期コード1件は既定ファイルの中身として残す", () => {
    const files = buildLockedSubmissionFiles({
      submissionFileSlots: null,
      starterFiles: [{ filename: "", language: "javascript", content: "function main() {}" }],
      codeLanguage: "javascript",
    });
    expect(files.map((file) => [file.filename, file.language, file.content])).toEqual([
      [DEFAULT_FILENAME_BY_LANGUAGE.javascript, "javascript", "function main() {}"],
    ]);
  });

  it("既定の1ファイルで初期コードが空なら slots は null", () => {
    const result = toSubmissionSlotPayload([
      { filename: "code.js", language: "javascript", starterContent: "" },
    ]);
    expect(result).toEqual({
      ok: true,
      slots: null,
      starterFiles: null,
      codeLanguage: "javascript",
    });
  });

  it("複数ファイルは slots と、中身があるときだけ starter を同じ順で返す", () => {
    const result = toSubmissionSlotPayload([
      { filename: " index.html ", language: "html", starterContent: "<p>" },
      { filename: "main.js", language: "javascript", starterContent: "" },
    ]);
    expect(result).toEqual({
      ok: true,
      codeLanguage: "html",
      slots: [htmlSlot, jsSlot],
      starterFiles: [
        { filename: "index.html", language: "html", content: "<p>" },
        { filename: "main.js", language: "javascript", content: "" },
      ],
    });
  });

  it("空のファイル名と重複は保存できない", () => {
    expect(
      toSubmissionSlotPayload([{ filename: "  ", language: "javascript", starterContent: "" }]).ok
    ).toBe(false);
    expect(
      toSubmissionSlotPayload([
        { filename: "a.js", language: "javascript", starterContent: "" },
        { filename: "a.js", language: "javascript", starterContent: "" },
      ]).ok
    ).toBe(false);
  });
});
