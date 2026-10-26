import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261026000000_add_record_content_view_rpc.sql"),
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

describe("record_content_view RPC (#501)", () => {
  it("SECURITY INVOKER で可視性を is_published 階層付き EXISTS にする", () => {
    const body = functionBody("record_content_view");
    expect(body).toContain("SECURITY INVOKER");
    expect(body).toContain("lc.is_published = true");
    expect(body).toContain("lp.is_published = true");
    expect(body).toContain("lt.is_published = true");
    expect(body).toContain("content not visible");
    expect(body).not.toContain("SECURITY DEFINER");
  });

  it("debounce 内スキップと別コンテンツ閲覧後の上書き判定を持つ", () => {
    const body = functionBody("record_content_view");
    expect(body).toContain("p_debounce_ms");
    expect(body).toContain("skipped");
    expect(body).toContain("up.last_viewed_at > v_existing");
  });

  it("upsert は last_viewed_at だけを更新する", () => {
    const body = functionBody("record_content_view");
    expect(body).toContain("DO UPDATE SET last_viewed_at = EXCLUDED.last_viewed_at");
    expect(body).not.toContain("is_completed");
    expect(body).not.toContain("completed_at");
    expect(body).not.toContain("ever_completed");
    expect(body).not.toContain("retry_started_at");
  });

  it("authenticated に EXECUTE を付与し anon は REVOKE する", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.record_content_view(INTEGER, INTEGER)"
    );
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_content_view(INTEGER, INTEGER)"
    );
    expect(migration).toContain("TO authenticated, service_role");
  });
});
