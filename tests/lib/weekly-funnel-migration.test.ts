import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Later migrations can add an overload or DROP + CREATE. Default privileges then
// grant EXECUTE again, which a single file does not show.

type ExecuteAcl = {
  anon: boolean;
  authenticated: boolean;
  public: boolean;
  serviceRole: boolean;
};

const migrationsDir = join(process.cwd(), "supabase/migrations");

function defaultAcl(): ExecuteAcl {
  return { anon: true, authenticated: true, public: true, serviceRole: true };
}

function normalizeArgs(raw: string): string {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of raw) {
    if (ch === "(") depth += 1;
    if (ch === ")" && depth > 0) depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts
    .map((part) => {
      let arg = part.replace(/\bDEFAULT\b[\s\S]*$/i, "").trim();
      arg = arg.replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, "").replace(/\s+/g, " ");
      const named = arg.match(/^[A-Za-z_][A-Za-z0-9_]*\s+(.+)$/);
      if (named) arg = named[1];
      return arg.toLowerCase().replace(/\s+/g, "");
    })
    .filter((arg) => arg.length > 0)
    .join(",");
}

function splitSql(sql: string): string[] {
  const parts: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const newline = sql.indexOf("\n", i);
      i = newline === -1 ? sql.length : newline + 1;
      current += " ";
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      current += " ";
      continue;
    }
    const dollar = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      const end = close === -1 ? sql.length : close + tag.length;
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    if (sql[i] === "'") {
      current += "'";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''";
          i += 2;
          continue;
        }
        current += sql[i];
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (sql[i] === ";") {
      const statement = current.trim();
      if (statement) parts.push(statement);
      current = "";
      i += 1;
      continue;
    }
    current += sql[i];
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

function functionPattern(name: string): string {
  return `(?:public\\.)?"?${name}"?`;
}

function createdSignature(
  statement: string,
  name: string
): { args: string; replace: boolean } | null {
  const match = statement.match(
    new RegExp(
      `^CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+${functionPattern(name)}\\s*\\(([^)]*)\\)`,
      "i"
    )
  );
  if (!match) return null;
  return { replace: Boolean(match[1]), args: normalizeArgs(match[2] ?? "") };
}

function droppedArgs(statement: string, name: string): string[] | "all" | null {
  if (!/^DROP\s+FUNCTION\b/i.test(statement)) return null;
  const re = new RegExp(`${functionPattern(name)}\\s*(\\(([^)]*)\\))?`, "gi");
  const found: Array<string | null> = [];
  for (const match of statement.matchAll(re)) {
    found.push(match[1] ? normalizeArgs(match[2] ?? "") : null);
  }
  if (found.length === 0) return null;
  if (found.some((args) => args === null)) return "all";
  return found.filter((args): args is string => args !== null);
}

function grantTarget(statement: string, name: string): string | "public-all" | null {
  const allInSchema = statement.match(
    /\bON\s+ALL\s+(?:FUNCTIONS|ROUTINES)\s+IN\s+SCHEMA\s+([\s\S]*)$/i
  );
  if (allInSchema && /(?:^|[\s,])"?public"?\b/i.test(allInSchema[1] ?? "")) {
    return "public-all";
  }
  const match = statement.match(
    new RegExp(`\\bON\\s+FUNCTION\\s+${functionPattern(name)}\\s*\\(([^)]*)\\)`, "i")
  );
  if (!match) return null;
  return normalizeArgs(match[1] ?? "");
}

function applyRoles(acl: ExecuteAcl, roles: string, turnOn: boolean) {
  if (clauseHas(roles, "PUBLIC")) acl.public = turnOn;
  if (clauseHas(roles, "anon")) acl.anon = turnOn;
  if (clauseHas(roles, "authenticated")) acl.authenticated = turnOn;
  if (clauseHas(roles, "service_role")) acl.serviceRole = turnOn;
}

function dollarBody(statement: string): string | null {
  const tag = /^[\s\S]*?(\$[A-Za-z0-9_]*\$)/.exec(statement);
  if (!tag?.[1]) return null;
  const start = tag.index + tag[0].length;
  const end = statement.indexOf(tag[1], start);
  if (end === -1) return null;
  return statement.slice(start, end);
}

function privilegeTail(statement: string): string | null {
  let i = 0;
  let dollar: string | null = null;
  while (i < statement.length) {
    if (dollar) {
      if (statement.startsWith(dollar, i)) {
        i += dollar.length;
        dollar = null;
        continue;
      }
      i += 1;
      continue;
    }
    const tag = /^\$[A-Za-z0-9_]*\$/.exec(statement.slice(i));
    if (tag) {
      dollar = tag[0];
      i += dollar.length;
      continue;
    }
    if (statement[i] === "'") {
      i += 1;
      while (i < statement.length) {
        if (statement[i] === "'" && statement[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (statement[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (/^(GRANT|REVOKE)\b/i.test(statement.slice(i))) return statement.slice(i);
    i += 1;
  }
  return null;
}

function applyStatement(statement: string, name: string, byArgs: Map<string, ExecuteAcl>) {
  const collapsed = statement.replace(/\s+/g, " ").trim();
  if (/^DO\b/i.test(collapsed)) {
    const inner = dollarBody(statement);
    if (!inner) return;
    for (const part of splitSql(inner)) {
      const privilege = privilegeTail(part);
      if (privilege) applyStatement(privilege, name, byArgs);
    }
    return;
  }
  const created = createdSignature(collapsed, name);
  if (created) {
    const existing = byArgs.get(created.args);
    if (!(created.replace && existing)) byArgs.set(created.args, defaultAcl());
    return;
  }
  const dropped = droppedArgs(collapsed, name);
  if (dropped === "all") {
    byArgs.clear();
    return;
  }
  if (dropped) {
    for (const args of dropped) byArgs.delete(args);
    return;
  }
  if (/^REVOKE\s+GRANT\s+OPTION\s+FOR\b/i.test(collapsed)) return;
  if (!/^GRANT\b/i.test(collapsed) && !/^REVOKE\b/i.test(collapsed)) return;
  const target = grantTarget(collapsed, name);
  if (target === null) return;
  const roles = roleClause(collapsed);
  if (!roles) return;
  const keys = target === "public-all" ? [...byArgs.keys()] : [target];
  for (const key of keys) {
    const acl = byArgs.get(key) ?? {
      anon: false,
      authenticated: false,
      public: false,
      serviceRole: false,
    };
    applyRoles(acl, roles, /^GRANT\b/i.test(collapsed));
    byArgs.set(key, acl);
  }
}

function replayExecuteAcl(sql: string, name: string): Map<string, ExecuteAcl> {
  const byArgs = new Map<string, ExecuteAcl>();
  for (const statement of splitSql(sql)) applyStatement(statement, name, byArgs);
  return byArgs;
}

function memberCanExecute(byArgs: Map<string, ExecuteAcl>): boolean {
  for (const acl of byArgs.values()) {
    if (acl.anon || acl.authenticated || acl.public) return true;
  }
  return false;
}

function allMigrationsSql(): string {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
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
    expect(revokeMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.stamp_stripe_subscription_funnel_times\(\) FROM authenticated;/
    );
  });

  it("全 migration を順に見ても残ったシグネチャは member から EXECUTE できない", () => {
    const funnel = replayExecuteAcl(allMigrationsSql(), "get_weekly_funnel");
    expect(funnel.size).toBeGreaterThan(0);
    expect(memberCanExecute(funnel)).toBe(false);
    expect([...funnel.values()].every((acl) => acl.serviceRole)).toBe(true);
    const trigger = replayExecuteAcl(allMigrationsSql(), "stamp_stripe_subscription_funnel_times");
    expect(trigger.size).toBeGreaterThan(0);
    expect(memberCanExecute(trigger)).toBe(false);
  });

  it("再付与・別シグネチャ・別スキーマ・引用符内の --・GRANT OPTION を落とす", () => {
    const base = revokeMigration;
    const regrants = [
      "GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO service_role, authenticated;",
      "GRANT ALL ON FUNCTION public.get_weekly_funnel(integer) TO authenticated;",
      "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;",
      "GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated;",
    ];
    for (const statement of regrants) {
      expect(memberCanExecute(replayExecuteAcl(`${base}\n${statement}`, "get_weekly_funnel"))).toBe(
        true
      );
    }
    const overload = `${base}
CREATE FUNCTION public.get_weekly_funnel(weeks integer, tz text) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
REVOKE EXECUTE ON FUNCTION public.get_weekly_funnel(integer) FROM PUBLIC, anon, authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(overload, "get_weekly_funnel"))).toBe(true);
    const otherSchema = `${base}
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(otherSchema, "get_weekly_funnel"))).toBe(true);
    const quotedComment = `${base}
INSERT INTO t VALUES ('a--b');
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(quotedComment, "get_weekly_funnel"))).toBe(true);
    const grantOption = `${base}
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated WITH GRANT OPTION;
REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.get_weekly_funnel(integer) FROM authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(grantOption, "get_weekly_funnel"))).toBe(true);
    const wrapper = `${base}
CREATE FUNCTION public.funnel_wrapper() RETURNS void LANGUAGE sql AS $$ SELECT * FROM public.get_weekly_funnel(8) $$;`;
    expect(memberCanExecute(replayExecuteAcl(wrapper, "get_weekly_funnel"))).toBe(false);
    const dropped = `${base}
DROP FUNCTION public.get_weekly_funnel(integer);`;
    expect(replayExecuteAcl(dropped, "get_weekly_funnel").size).toBe(0);
    const doBlock = `${base}
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated;
END $$;`;
    expect(memberCanExecute(replayExecuteAcl(doBlock, "get_weekly_funnel"))).toBe(true);
    const grantInBody = `${base}
CREATE FUNCTION public.funnel_wrapper() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated;
END $$;`;
    expect(memberCanExecute(replayExecuteAcl(grantInBody, "get_weekly_funnel"))).toBe(false);
  });
});
