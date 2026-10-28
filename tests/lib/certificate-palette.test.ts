import { describe, expect, it } from "vitest";
import { CERTIFICATE_PALETTES, getCertificatePalette } from "@/app/lib/certificate-palette";

describe("getCertificatePalette", () => {
  it("同じテーマは常に同じパレット", () => {
    expect(getCertificatePalette(7)).toBe(getCertificatePalette(7));
  });

  it("連続した id は別のパレットになり、一巡すると戻る", () => {
    const count = CERTIFICATE_PALETTES.length;
    expect(getCertificatePalette(1)).not.toBe(getCertificatePalette(2));
    expect(getCertificatePalette(1)).toBe(getCertificatePalette(1 + count));
  });

  it("0・負数・小数でも範囲内のパレットを返す", () => {
    for (const id of [0, -1, -7, 2.5]) {
      expect(CERTIFICATE_PALETTES).toContain(getCertificatePalette(id));
    }
  });

  it("パレットの色クラスは重複しない", () => {
    const sheets = CERTIFICATE_PALETTES.map((p) => p.sheet);
    expect(new Set(sheets).size).toBe(sheets.length);
  });
});
