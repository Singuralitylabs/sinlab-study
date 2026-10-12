import { describe, expect, it } from "vitest";
import { getSubmissionCodeFiles, withFallbackLanguage } from "@/app/lib/submission-files";

describe("withFallbackLanguage", () => {
  it("言語の無い単一ファイルにだけ課題の言語を補う", () => {
    const files = getSubmissionCodeFiles({ code_content: "SELECT 1;", code_files: null });
    expect(withFallbackLanguage(files, "sql")).toEqual([
      { filename: "", language: "sql", content: "SELECT 1;" },
    ]);
  });

  it("言語を持つファイルや複数ファイルはそのまま返す", () => {
    const single = [{ filename: "a.sh", language: "bash", content: "echo" }];
    expect(withFallbackLanguage(single, "sql")).toEqual(single);
    const many = [
      { filename: "", language: "", content: "a" },
      { filename: "", language: "", content: "b" },
    ];
    expect(withFallbackLanguage(many, "sql")).toEqual(many);
  });

  it("補う言語が無ければ変更しない", () => {
    const files = [{ filename: "", language: "", content: "x" }];
    expect(withFallbackLanguage(files, null)).toEqual(files);
  });
});
