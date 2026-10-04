import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261005000000_add_certificates.sql"),
  "utf8"
);

describe("certificates マイグレーション（#291）", () => {
  it("1テーマ1枚（UNIQUE (user_id, theme_id)）で、証明番号も一意", () => {
    expect(migration).toMatch(/UNIQUE \(user_id, theme_id\)/);
    expect(migration).toMatch(/UNIQUE \(certificate_no\)/);
  });

  it("受講者名・テーマ名のスナップショット列を持つ", () => {
    expect(migration).toMatch(/recipient_name TEXT NOT NULL/);
    expect(migration).toMatch(/theme_name TEXT NOT NULL/);
  });

  it("RLS を有効にし、ポリシーは SELECT の1本だけ（INSERT / UPDATE / DELETE は作らない）", () => {
    expect(migration).toContain("ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY");
    const policies = [
      ...migration.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.(\w+) FOR (\w+)/g),
    ];
    expect(policies.map(([, , table, op]) => `${table}:${op}`)).toEqual(["certificates:SELECT"]);
  });

  it("本人または admin / maintainer を OR で1本にし、get_user_xxx() は (select ...) で包む", () => {
    expect(migration).toContain("user_id = (select get_user_id())");
    expect(migration).toContain("(select get_user_role()) IN ('admin', 'maintainer')");
    expect(migration.match(/get_user_id\(\)/g)).toHaveLength(1);
    expect(migration.match(/get_user_role\(\)/g)).toHaveLength(1);
  });

  it("email_kind_settings に certificate_issued を有効で追加する", () => {
    expect(migration).toMatch(/\('certificate_issued', true, NULL, NULL\)/);
  });
});
