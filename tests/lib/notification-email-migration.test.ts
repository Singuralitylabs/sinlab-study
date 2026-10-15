import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_EMAIL_LOG_KIND } from "@/app/constants/notifications";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261015130433_add_notification_email.sql"),
  "utf8"
);

describe("通知先カラムのマイグレーション", () => {
  it("確認メールの claim は service_role だけが実行でき、種別は定数と同じ", () => {
    expect(migration).toContain(`kind = '${NOTIFICATION_EMAIL_LOG_KIND.CONFIRM}'`);
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.claim_notification_email_confirm(INTEGER, TEXT, TIMESTAMPTZ, INTEGER)"
    );
    expect(migration).toContain("TO service_role");
    expect(migration).not.toMatch(/CREATE POLICY/);
  });

  it("users.email は書き換えず、トークンの平文カラムを作らない", () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.users/i);
    expect(migration).not.toContain("notification_email_token ");
    expect(migration).toContain("notification_email_token_hash");
  });
});
