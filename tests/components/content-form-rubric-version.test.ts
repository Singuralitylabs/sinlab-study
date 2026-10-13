import { describe, expect, it } from "vitest";
import { adoptSavedRubricVersion } from "@/app/(authenticated)/manage/contents/ContentForm";

describe("adoptSavedRubricVersion", () => {
  it("成功応答の版だけを、画面上の要件の版として覚える", () => {
    const versionRef = { current: 1 as number | null };
    let shown: number | null = 1;
    adoptSavedRubricVersion({ success: true, grading_rubric_version: 2 }, versionRef, (version) => {
      shown = version;
    });
    expect(versionRef.current).toBe(2);
    expect(shown).toBe(2);
  });

  it("版が無い応答では、開いたときの版を残す", () => {
    const versionRef = { current: 1 as number | null };
    adoptSavedRubricVersion({ success: true }, versionRef, () => {
      throw new Error("should not adopt");
    });
    expect(versionRef.current).toBe(1);
  });

  it("削除した採点基準は null を覚える", () => {
    const versionRef = { current: 4 as number | null };
    adoptSavedRubricVersion({ grading_rubric_version: null }, versionRef, (version) => {
      versionRef.current = version;
    });
    expect(versionRef.current).toBeNull();
  });
});
