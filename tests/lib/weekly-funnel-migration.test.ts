import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pins statement lines only. A newer migration fails when it names either
// function, or grants ALL FUNCTIONS/ROUTINES IN SCHEMA, so a human re-checks
// the ACL. When it fires, re-pin revokeFile and revokeStamp to that file
// after its ACL is service_role-only. Do not allowlist the name or delete this.
// OWNER TO, dynamic EXECUTE, RENAME, and role inheritance are not interpreted.
// A database privilege check is issue #340.

const migrationsDir = join(process.cwd(), "supabase/migrations");
const revokeStamp = "20261012133635";
const revokeFile = `${revokeStamp}_revoke_weekly_funnel_from_authenticated.sql`;
const baseFile = "20261004050556_add_weekly_funnel_rpc.sql";
const funnelName =
  /get_weekly_funnel|stamp_stripe_subscription_funnel_times|ALL\s+(FUNCTIONS|ROUTINES)\s+IN\s+SCHEMA/i;

const serviceRoleGrant =
  "GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO service_role;";

describe("get_weekly_funnel の EXECUTE 取り消し（#319）", () => {
  const revokeSql = readFileSync(join(migrationsDir, revokeFile), "utf8");
  const baseSql = readFileSync(join(migrationsDir, baseFile), "utf8");

  it("PUBLIC / anon / authenticated を外し service_role だけに残す", () => {
    expect(revokeSql).toMatch(
      /^REVOKE EXECUTE ON FUNCTION public\.get_weekly_funnel\(integer\) FROM PUBLIC, anon, authenticated;$/m
    );
    expect(revokeSql).toMatch(
      /^GRANT EXECUTE ON FUNCTION public\.get_weekly_funnel\(integer\) TO service_role;$/m
    );
    const grants = revokeSql
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^GRANT\b/i.test(line));
    expect(grants).toEqual([serviceRoleGrant]);
  });

  it("トリガー関数は PUBLIC / anon / authenticated を外す", () => {
    expect(baseSql).toMatch(
      /^REVOKE ALL ON FUNCTION public\.stamp_stripe_subscription_funnel_times\(\) FROM PUBLIC, anon;$/m
    );
    expect(revokeSql).toMatch(
      /^REVOKE ALL ON FUNCTION public\.stamp_stripe_subscription_funnel_times\(\) FROM authenticated;$/m
    );
  });

  it("取り消しより後は関数名もスキーマ一括 GRANT も書かない", () => {
    const later = readdirSync(migrationsDir).filter((name) => {
      if (!name.endsWith(".sql") || name.slice(0, 14) <= revokeStamp) {
        return false;
      }
      return funnelName.test(readFileSync(join(migrationsDir, name), "utf8"));
    });
    expect(later).toEqual([]);
  });
});
