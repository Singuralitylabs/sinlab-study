import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES } from "@/app/components/code-editor-utils";
import { CONTENT_TYPES } from "@/app/constants/content";
import { QUIZ_MAX_CHOICES, QUIZ_MIN_CHOICES, QUIZ_QUESTION_TYPES } from "@/app/lib/quiz";

const migrationsDir = join(process.cwd(), "supabase/migrations");

/**
 * Allowed values of the newest `ADD CONSTRAINT <name> CHECK (<column> IN (...))` across the
 * migrations (file names sort by timestamp, so the last match is what the DB has now).
 */
function latestCheckValues(constraintName: string): string[] {
  const pattern = new RegExp(
    `ADD CONSTRAINT ${constraintName}\\s+CHECK \\(\\w+ IN \\(([^)]*)\\)\\)`,
    "g"
  );
  let latest: string | null = null;
  for (const file of readdirSync(migrationsDir).sort()) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    for (const match of sql.matchAll(pattern)) {
      latest = match[1];
    }
  }
  if (latest === null) {
    throw new Error(`${constraintName} が見つかりません`);
  }
  return [...latest.matchAll(/'([^']+)'/g)].map(([, value]) => value);
}

describe("learning_contents の CHECK 制約とアプリの許可値の一致", () => {
  it("code_language の許可値が CODE_LANGUAGES と一致する", () => {
    expect(latestCheckValues("learning_contents_code_language_check").sort()).toEqual(
      [...CODE_LANGUAGES].sort()
    );
  });

  it("content_type の許可値が CONTENT_TYPES と一致する", () => {
    expect(latestCheckValues("learning_contents_content_type_check").sort()).toEqual(
      [...CONTENT_TYPES].sort()
    );
  });
});

describe("quiz_questions の CHECK 制約とアプリの許可値の一致", () => {
  const quizMigration = readFileSync(
    join(migrationsDir, "20261010000001_add_quiz_content_type.sql"),
    "utf8"
  );

  it("question_type の許可値が QUIZ_QUESTION_TYPES と一致する", () => {
    const match = quizMigration.match(/question_type IN \(([^)]*)\)/);
    const values = [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].map(([, value]) => value);
    expect(values.sort()).toEqual([...QUIZ_QUESTION_TYPES].sort());
  });

  it("選択肢の数の範囲が QUIZ_MIN_CHOICES / QUIZ_MAX_CHOICES と一致する", () => {
    const ranges = [...quizMigration.matchAll(/cardinality\(choices\) BETWEEN (\d+) AND (\d+)/g)];
    expect(ranges.length).toBeGreaterThan(0);
    for (const [, min, max] of ranges) {
      expect([Number(min), Number(max)]).toEqual([QUIZ_MIN_CHOICES, QUIZ_MAX_CHOICES]);
    }
  });
});
