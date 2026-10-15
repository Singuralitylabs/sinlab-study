import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261015143612_exercise_review_pass_completion.sql"),
  "utf8"
);

function functionBody(name: string): string {
  const match = migration.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?\\$\\$;`)
  );
  if (!match) {
    throw new Error(`${name} が見つかりません`);
  }
  return match[0];
}

describe("合格必須の判定（#367）", () => {
  it("演習かつ grading_rubric IS NOT NULL。空配列の長さでは外さない", () => {
    const body = functionBody("learning_content_requires_review_pass");
    expect(body).toContain("lc.content_type = 'exercise'");
    expect(body).toContain("lc.grading_rubric IS NOT NULL");
    expect(body).not.toContain("jsonb_array_length");
  });

  it("画面と進捗 API の RPC とトリガーは同じ関数だけを見る", () => {
    const rpc = functionBody("content_requires_review_pass");
    const trigger = functionBody("enforce_user_progress_review_pass");
    expect(rpc).toContain("learning_content_requires_review_pass(p_content_id)");
    expect(trigger).toContain("learning_content_requires_review_pass(");
    expect(rpc).not.toContain("jsonb_array_length");
    expect(trigger).not.toContain("jsonb_array_length");
  });
});
