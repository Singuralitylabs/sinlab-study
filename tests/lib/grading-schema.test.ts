import { describe, expect, it } from "vitest";
import { GRADING_RUBRIC_MAX_REQUIREMENTS } from "@/app/constants/grading";
import {
  clearedGradingRubric,
  GradingRubricInputSchema,
  nextGradingRubric,
  parseGradingRubric,
  parseStoredGradingRubric,
} from "@/app/lib/grading-schema";

const req = (key: string, name = `要件${key}`, description = "") => ({ key, name, description });

describe("GradingRubricInputSchema", () => {
  it("1〜10件の要件を受け付ける", () => {
    expect(GradingRubricInputSchema.safeParse({ requirements: [req("r1")] }).success).toBe(true);
    const ten = Array.from({ length: GRADING_RUBRIC_MAX_REQUIREMENTS }, (_, i) => req(`r${i + 1}`));
    expect(GradingRubricInputSchema.safeParse({ requirements: ten }).success).toBe(true);
  });

  it("0件・上限超過・key 重複・名前が空は拒否する", () => {
    expect(GradingRubricInputSchema.safeParse({ requirements: [] }).success).toBe(false);
    const eleven = Array.from({ length: GRADING_RUBRIC_MAX_REQUIREMENTS + 1 }, (_, i) =>
      req(`r${i + 1}`)
    );
    expect(GradingRubricInputSchema.safeParse({ requirements: eleven }).success).toBe(false);
    expect(
      GradingRubricInputSchema.safeParse({ requirements: [req("r1"), req("r1")] }).success
    ).toBe(false);
    expect(GradingRubricInputSchema.safeParse({ requirements: [req("r1", "  ")] }).success).toBe(
      false
    );
  });

  it("クライアントが送った version は採用しない", () => {
    const parsed = GradingRubricInputSchema.parse({ version: 99, requirements: [req("r1")] });
    expect("version" in parsed).toBe(false);
  });
});

describe("parseGradingRubric", () => {
  it("version 付きの正しい値を返す。不正・未設定は null（推測採点にフォールバック）", () => {
    const rubric = { version: 2, requirements: [req("r1")] };
    expect(parseGradingRubric(rubric)).toEqual(rubric);
    expect(parseGradingRubric(null)).toBeNull();
    expect(parseGradingRubric({ requirements: [req("r1")] })).toBeNull();
    expect(parseGradingRubric({ version: 1, requirements: [] })).toBeNull();
  });
});

describe("nextGradingRubric", () => {
  it("初回保存は version 1", () => {
    expect(nextGradingRubric(null, { requirements: [req("r1")] })).toEqual({
      version: 1,
      requirements: [req("r1")],
      max_key_number: 1,
    });
  });

  it("内容が変わらなければ version を上げない（前後の空白差も無視）", () => {
    const current = { version: 3, requirements: [req("r1", "A", "a")] };
    const next = nextGradingRubric(current, { requirements: [req("r1", " A ", " a ")] });
    expect(next.version).toBe(3);
  });

  it("要件の追加・削除・名前/説明の変更・並べ替えで version を +1 する", () => {
    const current = { version: 3, requirements: [req("r1", "A"), req("r2", "B")] };
    expect(nextGradingRubric(current, { requirements: [req("r1", "A")] }).version).toBe(4);
    expect(
      nextGradingRubric(current, { requirements: [req("r1", "A"), req("r2", "B2")] }).version
    ).toBe(4);
    expect(
      nextGradingRubric(current, {
        requirements: [req("r1", "A"), req("r2", "B"), req("r3", "C")],
      }).version
    ).toBe(4);
    expect(
      nextGradingRubric(current, { requirements: [req("r2", "B"), req("r1", "A")] }).version
    ).toBe(4);
  });

  it("末尾の要件を削除して保存しても、発行済みの最大番号は下がらない", () => {
    const v1 = nextGradingRubric(null, {
      requirements: [req("r1"), req("r2"), req("r3")],
    });
    const v2 = nextGradingRubric(v1, { requirements: [req("r1"), req("r2")] });
    expect(v2.max_key_number).toBe(3);
    const v3 = nextGradingRubric(v2, { requirements: [req("r1"), req("r2"), req("r4")] });
    expect(v3.max_key_number).toBe(4);
  });

  it("最大番号を持たない既存の基準は、現存する key から補って保存する", () => {
    const legacy = { version: 2, requirements: [req("r1"), req("r5")] };
    expect(nextGradingRubric(legacy, { requirements: [req("r1")] }).max_key_number).toBe(5);
  });

  it("クライアントが送った max_key_number は採用しない", () => {
    const parsed = GradingRubricInputSchema.parse({ max_key_number: 0, requirements: [req("r1")] });
    expect("max_key_number" in parsed).toBe(false);
  });
});

describe("採点基準の墓石（#344）", () => {
  const live = { version: 2, requirements: [req("r1"), req("r3")], max_key_number: 5 };

  it("削除すると版を進め、発行済みキーの最大番号を引き継ぐ", () => {
    expect(clearedGradingRubric(live)).toEqual({
      version: 3,
      requirements: [],
      max_key_number: 5,
    });
    expect(clearedGradingRubric({ version: 1, requirements: [req("r4")] })?.max_key_number).toBe(4);
  });

  it("もともと基準が無ければ NULL のまま、削除済みなら変えない", () => {
    expect(clearedGradingRubric(null)).toBeNull();
    const tombstone = { version: 3, requirements: [], max_key_number: 5 };
    expect(clearedGradingRubric(tombstone)).toBe(tombstone);
  });

  it("墓石から再設定すると版を引き継いで +1、番号も下がらない", () => {
    expect(
      nextGradingRubric(
        { version: 3, requirements: [], max_key_number: 5 },
        {
          requirements: [req("r6")],
        }
      )
    ).toEqual({ version: 4, requirements: [req("r6", "要件r6")], max_key_number: 6 });
  });

  it("採点では墓石を基準なしとして扱い、書き込み側だけが墓石を読む", () => {
    const tombstone = { version: 3, requirements: [], max_key_number: 5 };
    expect(parseGradingRubric(tombstone)).toBeNull();
    expect(parseStoredGradingRubric(tombstone)).toEqual(tombstone);
    expect(parseStoredGradingRubric(live)).toEqual(live);
    expect(parseStoredGradingRubric(null)).toBeNull();
    expect(parseStoredGradingRubric({ version: 0, requirements: [] })).toBeNull();
  });
});
