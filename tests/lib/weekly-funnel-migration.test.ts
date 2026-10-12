import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261012133635_revoke_weekly_funnel_from_authenticated.sql"
  ),
  "utf8"
);

describe("get_weekly_funnel の EXECUTE 取り消し（#319）", () => {
  it("PUBLIC / anon / authenticated から EXECUTE を外し、service_role だけに残す", () => {
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.get_weekly_funnel\(integer\) FROM PUBLIC, anon, authenticated;/
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_weekly_funnel\(integer\) TO service_role;/
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_weekly_funnel[\s\S]*TO authenticated/
    );
  });
});
