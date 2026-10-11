import { describe, expect, it } from "vitest";
import {
  getSlideStorageWarning,
  isSlideStorageRemovalFailed,
} from "@/app/lib/slide-storage-warning";

describe("isSlideStorageRemovalFailed（issue #241）", () => {
  it("storageRemoved: false のときだけ true を返す", () => {
    expect(isSlideStorageRemovalFailed({ success: true, storageRemoved: false })).toBe(true);
  });

  it.each([
    ["storageRemoved: true", { success: true, storageRemoved: true }],
    ["storageRemoved 無し", { success: true }],
    ["storageRemoved が文字列", { success: true, storageRemoved: "false" }],
    ["null（JSON 解析失敗）", null],
    ["配列", []],
  ])("%s では false を返す", (_label, data) => {
    expect(isSlideStorageRemovalFailed(data)).toBe(false);
  });
});

describe("getSlideStorageWarning（issue #241）", () => {
  it("単体削除: DB 側は削除済みで、スライドPDFがストレージに残っている旨を返す", () => {
    const warning = getSlideStorageWarning({ storageRemoved: false }, "delete");
    expect(warning).toContain("削除しましたが");
    expect(warning).toContain("スライドPDF");
    expect(warning).toContain("ストレージ上にファイルが残っている可能性があります");
  });

  it("更新: 差し替え前のスライドPDFが残っている旨を返す", () => {
    const warning = getSlideStorageWarning({ storageRemoved: false }, "update");
    expect(warning).toContain("コンテンツを更新しましたが");
    expect(warning).toContain("差し替え前のスライドPDF");
  });

  it("一括削除: 一部のスライドPDFが残っている旨を返す", () => {
    const warning = getSlideStorageWarning({ storageRemoved: false }, "bulkDelete");
    expect(warning).toContain("一部のスライドPDF");
  });

  it("Storage 削除に成功している応答では null を返す（従来どおり成功表示）", () => {
    expect(getSlideStorageWarning({ storageRemoved: true }, "delete")).toBeNull();
    expect(getSlideStorageWarning({ success: true }, "update")).toBeNull();
  });
});
