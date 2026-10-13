import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pins the REVOKE/GRANT text only. Replaying later SQL misses OWNER TO, dynamic
// EXECUTE, RENAME, and role inheritance, and those misses are not special-cased
// here. A database privilege check is tracked in issue #340.

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20261012133635_revoke_weekly_funnel_from_authenticated.sql"
);

describe("get_weekly_funnel の EXECUTE 取り消し（#319）", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("PUBLIC / anon / authenticated を外し service_role だけに残す", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.get_weekly_funnel\(integer\) FROM PUBLIC, anon, authenticated;/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_weekly_funnel\(integer\) TO service_role;/
    );
  });

  it("トリガー関数の authenticated も外す", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.stamp_stripe_subscription_funnel_times\(\) FROM authenticated;/
    );
  });
});
