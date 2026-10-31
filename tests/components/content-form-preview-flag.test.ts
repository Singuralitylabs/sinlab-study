import { describe, expect, it } from "vitest";
import { storedPreviewFlag } from "@/app/(authenticated)/manage/(content)/contents/ContentForm";

describe("storedPreviewFlag", () => {
  it("未編集なら常に NULL（自動）", () => {
    expect(storedPreviewFlag(false, true, true)).toBeNull();
    expect(storedPreviewFlag(false, false, true)).toBeNull();
    expect(storedPreviewFlag(false, null, false)).toBeNull();
  });

  it("編集済みのオンは許されるときだけ true、そうでなければ NULL", () => {
    expect(storedPreviewFlag(true, true, true)).toBe(true);
    expect(storedPreviewFlag(true, true, false)).toBeNull();
  });

  it("編集済みのオフは false のまま残す", () => {
    expect(storedPreviewFlag(true, false, true)).toBe(false);
    expect(storedPreviewFlag(true, false, false)).toBe(false);
  });

  it("編集済みでも値が null なら NULL", () => {
    expect(storedPreviewFlag(true, null, true)).toBeNull();
  });
});
