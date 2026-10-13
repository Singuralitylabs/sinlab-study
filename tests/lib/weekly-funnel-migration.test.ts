import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pins statement lines only. A migration newer than the revoke file that names
// either function fails, so a human re-checks the ACL before it can land.
// OWNER TO, dynamic EXECUTE, RENAME, and role inheritance are not interpreted.
// A database privilege check is issue #340.

const migrationsDir = join(process.cwd(), "supabase/migrations");
const revokeStamp = "20261012133635";
const revokeFile = `${revokeStamp}_revoke_weekly_funnel_from_authenticated.sql`;
const baseFile = "20261004050556_add_weekly_funnel_rpc.sql";
const funnelName = /get_weekly_funnel|stamp_stripe_subscription_funnel_times/;

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
      .filter((line) => /^GRANT\b/.test(line));
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

  it("取り消しより後のマイグレーションはどちらの関数名も書かない", () => {
    const later = readdirSync(migrationsDir).filter((name) => {
      if (!name.endsWith(".sql") || name.slice(0, 14) <= revokeStamp) {
        return false;
      }
      return funnelName.test(readFileSync(join(migrationsDir, name), "utf8"));
    });
    expect(later).toEqual([]);
  });
});
