import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261026010000_add_get_exercise_review_pass_state_rpc.sql"
  ),
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

describe("get_exercise_review_pass_state RPC (#502)", () => {
  it("SECURITY INVOKER で既存ヘルパーと合格レビュー EXISTS だけを返す", () => {
    const body = functionBody("get_exercise_review_pass_state");
    expect(body).toContain("SECURITY INVOKER");
    expect(body).toContain("content_requires_review_pass(p_content_id)");
    expect(body).toContain("content_review_pass_unachievable(p_content_id)");
    expect(body).toContain("has_passing_review");
    expect(body).toContain("r.passed IS TRUE");
    expect(body).not.toContain("grading_rubric");
    expect(body).not.toContain("reference_answer");
    expect(body).not.toContain("SECURITY DEFINER");
  });

  it("authenticated に EXECUTE を付与し anon は REVOKE する", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_exercise_review_pass_state(INTEGER)"
    );
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_exercise_review_pass_state(INTEGER)"
    );
    expect(migration).toContain("TO authenticated, service_role");
  });
});
