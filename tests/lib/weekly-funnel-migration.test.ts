import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A later migration can DROP and CREATE the function. Default privileges then
// grant EXECUTE to anon and authenticated again, which a single-file read misses.

type FunnelAcl = {
  anon: boolean;
  authenticated: boolean;
  public: boolean;
  serviceRole: boolean;
};

type FunnelPrivileges = {
  acl: FunnelAcl;
  recreateMissingRevoke: boolean;
};

const migrationsDir = join(process.cwd(), "supabase/migrations");

function defaultAcl(): FunnelAcl {
  return { anon: true, authenticated: true, public: true, serviceRole: true };
}

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function splitSql(sql: string): string[] {
  const source = stripComments(sql);
  const parts: string[] = [];
  let current = "";
  let i = 0;
  let dollar: string | null = null;
  while (i < source.length) {
    if (dollar) {
      if (source.startsWith(dollar, i)) {
        current += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      current += source[i];
      i += 1;
      continue;
    }
    const dollarTag = /^\$[A-Za-z0-9_]*\$/.exec(source.slice(i));
    if (dollarTag) {
      dollar = dollarTag[0];
      current += dollar;
      i += dollar.length;
      continue;
    }
    if (source[i] === "'") {
      current += "'";
      i += 1;
      while (i < source.length) {
        if (source[i] === "'" && source[i + 1] === "'") {
          current += "''";
          i += 2;
          continue;
        }
        current += source[i];
        if (source[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (source[i] === ";") {
      const statement = current.trim();
      if (statement) parts.push(statement);
      current = "";
      i += 1;
      continue;
    }
    current += source[i];
    i += 1;
  }
  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

function roleClause(statement: string): string | null {
  const grant = statement.match(/\bGRANT\b[\s\S]*\bTO\b([\s\S]*)$/i);
  if (grant) return grant[1];
  const revoke = statement.match(/\bREVOKE\b[\s\S]*\bFROM\b([\s\S]*)$/i);
  if (revoke) return revoke[1];
  return null;
}

function clauseHas(clause: string, role: string): boolean {
  return new RegExp(`\\b${role}\\b`, "i").test(clause);
}

function replayFunnelPrivileges(sql: string): FunnelPrivileges {
  const acl: FunnelAcl = { anon: false, authenticated: false, public: false, serviceRole: false };
  let exists = false;
  let recreateMissingRevoke = false;
  for (const statement of splitSql(sql)) {
    const collapsed = statement.replace(/\s+/g, " ");
    const mentionsFunnel = /\bget_weekly_funnel\b/i.test(collapsed);
    const allFunctions = /\bON\s+ALL\s+FUNCTIONS\b/i.test(collapsed);
    if (/\bDROP\s+FUNCTION\b/i.test(collapsed) && mentionsFunnel) {
      exists = false;
      recreateMissingRevoke = true;
      continue;
    }
    if (/^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i.test(collapsed) && mentionsFunnel) {
      const replace = /^CREATE\s+OR\s+REPLACE\s+FUNCTION\b/i.test(collapsed);
      if (!exists || !replace) {
        Object.assign(acl, defaultAcl());
      }
      if (!replace) recreateMissingRevoke = true;
      exists = true;
      continue;
    }
    const isGrant = /^GRANT\b/i.test(collapsed);
    const isRevoke = /^REVOKE\b/i.test(collapsed);
    if ((!isGrant && !isRevoke) || (!mentionsFunnel && !allFunctions)) continue;
    const roles = roleClause(collapsed);
    if (!roles) continue;
    const turnOn = isGrant;
    if (clauseHas(roles, "PUBLIC")) acl.public = turnOn;
    if (clauseHas(roles, "anon")) acl.anon = turnOn;
    if (clauseHas(roles, "authenticated")) acl.authenticated = turnOn;
    if (clauseHas(roles, "service_role")) acl.serviceRole = turnOn;
    if (isRevoke && clauseHas(roles, "authenticated")) recreateMissingRevoke = false;
  }
  return { acl, recreateMissingRevoke };
}

function allMigrationsSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
    .join("\n");
}

describe("get_weekly_funnel の EXECUTE 取り消し（#319）", () => {
  const revokeMigration = readFileSync(
    join(migrationsDir, "20261012133635_revoke_weekly_funnel_from_authenticated.sql"),
    "utf8"
  );

  it("取り消し migration は PUBLIC / anon / authenticated を外し service_role だけに残す", () => {
    expect(revokeMigration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.get_weekly_funnel\(integer\) FROM PUBLIC, anon, authenticated;/
    );
    expect(revokeMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_weekly_funnel\(integer\) TO service_role;/
    );
  });

  it("全 migration を順に見ても anon / authenticated / PUBLIC には EXECUTE が残らない", () => {
    const result = replayFunnelPrivileges(allMigrationsSql());
    expect(result.recreateMissingRevoke).toBe(false);
    expect(result.acl).toEqual({
      anon: false,
      authenticated: false,
      public: false,
      serviceRole: true,
    });
  });

  it("1文の中の再付与と、DROP / CREATE のあとに REVOKE が無い場合を落とす", () => {
    const base = revokeMigration;
    const regrants = [
      "GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO service_role, authenticated;",
      "GRANT ALL ON FUNCTION public.get_weekly_funnel(integer) TO authenticated;",
      "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;",
    ];
    for (const statement of regrants) {
      expect(replayFunnelPrivileges(`${base}\n${statement}`).acl.authenticated).toBe(true);
    }
    const recreated = `${base}
DROP FUNCTION public.get_weekly_funnel(integer);
CREATE FUNCTION public.get_weekly_funnel(weeks integer) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`;
    expect(replayFunnelPrivileges(recreated).recreateMissingRevoke).toBe(true);
    const revokedAgain = `${recreated}
REVOKE EXECUTE ON FUNCTION public.get_weekly_funnel(integer) FROM PUBLIC, anon, authenticated;`;
    expect(replayFunnelPrivileges(revokedAgain).recreateMissingRevoke).toBe(false);
    expect(replayFunnelPrivileges(revokedAgain).acl.authenticated).toBe(false);
  });
});
