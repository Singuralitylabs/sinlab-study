import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every path that counts toward theme completion or progress must exclude appendix phases
 * (#556). One path left on the plain published filter would put appendices back into that
 * screen's denominator, so finished learners drop under 100% only there.
 */
const COUNTING_FILES = [
  "app/services/api/learning-server.ts",
  "app/services/api/certificates-server.ts",
  "app/services/notifications/email-digest-server.ts",
  "app/services/notifications/push-digest.ts",
];

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("付録を外す絞り込みの適用漏れ (#556)", () => {
  it.each(COUNTING_FILES)("%s は付録を含む公開ツリーの絞り込みを使わない", (path) => {
    const code = source(path);
    expect(code).toContain("applyMainCourseNestedThemeFilters(");
    expect(code).not.toMatch(/applyPublishedNestedThemeFilters\(/);
  });

  it("learning-server の集計 3 関数（単一テーマ・全テーマ・ホーム）がすべて付録を外す", () => {
    const calls = source("app/services/api/learning-server.ts").match(
      /applyMainCourseNestedThemeFilters\(/g
    );
    expect(calls).toHaveLength(3);
  });
});
