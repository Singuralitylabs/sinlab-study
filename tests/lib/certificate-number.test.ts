import { describe, expect, it } from "vitest";
import { generateCertificateNo, isCertificateNoCollision } from "@/app/lib/certificate-number";

describe("generateCertificateNo", () => {
  it("SS-YYYYMM-XXXXXX 形式（DB の CHECK と同じ形）", () => {
    const no = generateCertificateNo(new Date("2026-10-04T03:00:00Z"));
    expect(no).toMatch(/^SS-202610-[0-9A-Z]{6}$/);
  });

  it("年月は JST で数える（UTC では前月末でも JST の月になる）", () => {
    expect(generateCertificateNo(new Date("2026-09-30T15:30:00Z"))).toMatch(/^SS-202610-/);
    expect(generateCertificateNo(new Date("2026-12-31T14:59:00Z"))).toMatch(/^SS-202612-/);
    expect(generateCertificateNo(new Date("2026-12-31T15:00:00Z"))).toMatch(/^SS-202701-/);
  });

  it("乱数部は注入した乱数から決まる（紛らわしい I / O を含まない文字種）", () => {
    expect(generateCertificateNo(new Date("2026-10-04T00:00:00Z"), () => 0)).toBe(
      "SS-202610-000000"
    );
    const all = Array.from({ length: 200 }, () => generateCertificateNo(new Date()));
    expect(all.every((no) => !/[IO]/.test(no.slice(10)))).toBe(true);
  });
});

describe("isCertificateNoCollision", () => {
  it("証明番号の衝突（details または制約名）だけを true にする", () => {
    expect(
      isCertificateNoCollision({
        details: "Key (certificate_no)=(SS-202610-ABC123) already exists.",
      })
    ).toBe(true);
    expect(
      isCertificateNoCollision({
        message:
          'duplicate key value violates unique constraint "certificates_certificate_no_unique"',
      })
    ).toBe(true);
  });

  it("(user_id, theme_id) の重複は false（制約名に文言が含まれても判定が反転しない）", () => {
    expect(
      isCertificateNoCollision({
        message: 'duplicate key value violates unique constraint "certificates_user_theme_unique"',
        details: "Key (user_id, theme_id)=(2, 5) already exists.",
      })
    ).toBe(false);
  });
});
