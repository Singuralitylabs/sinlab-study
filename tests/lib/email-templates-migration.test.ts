import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_SERVICE_NAME, EMAIL_SERVICE_SUBTITLE } from "@/app/constants/notifications";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261003000000_add_email_templates.sql"),
  "utf8"
);

describe("email_templates マイグレーション（#286）", () => {
  it("サービス名の列の既定値がコードの既定値と一致する", () => {
    expect(migration).toContain(`service_name TEXT NOT NULL DEFAULT '${EMAIL_SERVICE_NAME}'`);
    expect(migration).toContain(`service_subtitle TEXT DEFAULT '${EMAIL_SERVICE_SUBTITLE}'`);
  });

  it("RLS を有効にし、email_templates の SELECT / INSERT / UPDATE / DELETE は admin のみ・同一操作は1本", () => {
    expect(migration).toContain("ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY");
    for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const policies = migration.match(
        new RegExp(
          `CREATE POLICY [^\\n]+\\n\\s+ON public\\.email_templates FOR ${operation}\\b`,
          "g"
        )
      );
      expect(policies, operation).toHaveLength(1);
    }
    const conditions = migration.match(/\(select get_user_role\(\)\) = 'admin'/g) ?? [];
    expect(conditions.length).toBeGreaterThanOrEqual(5);
    expect(migration).not.toMatch(/auth\.uid\(\)|[^(]get_user_role\(\) =/);
  });

  it("テスト送信の記録テーブルは RLS 有効・ポリシー無し（service_role のみ）", () => {
    expect(migration).toContain("ALTER TABLE public.email_test_sends ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/CREATE POLICY[^;]*email_test_sends/);
  });
});
