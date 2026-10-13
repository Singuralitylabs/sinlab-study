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
    .map((part) => normalizeOneArg(part))
    .filter((arg): arg is string => arg !== null && arg.length > 0)
    .join(",");
}

function normalizeOneArg(part: string): string | null {
  let arg = part
    .replace(/\bDEFAULT\b[\s\S]*$/i, "")
    .trim()
    .replace(/\s+/g, " ");
  const leading = arg.match(/^(IN|OUT|INOUT|VARIADIC)\s+/i);
  if (leading?.[1]?.toUpperCase() === "OUT") return null;
  if (leading) arg = arg.slice(leading[0].length).trim();
  const namedMode = arg.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(IN|OUT|INOUT|VARIADIC)\s+(.+)$/i);
  if (namedMode) {
    if (namedMode[2]?.toUpperCase() === "OUT") return null;
    arg = namedMode[3] ?? "";
  } else {
    const named = arg.match(/^[A-Za-z_][A-Za-z0-9_]*\s+(.+)$/);
    if (named) arg = named[1] ?? "";
  }
  return canonicalType(arg.toLowerCase().replace(/\s+/g, ""));
}

function canonicalType(typeName: string): string {
  const array = typeName.endsWith("[]") ? "[]" : "";
  const base = array ? typeName.slice(0, -2).replace(/"/g, "") : typeName.replace(/"/g, "");
  const aliases: Record<string, string> = {
    int: "integer",
    int4: "integer",
    integer: "integer",
    "pg_catalog.int": "integer",
    "pg_catalog.int4": "integer",
    "pg_catalog.integer": "integer",
  };
  return `${aliases[base] ?? base}${array}`;
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
  return `(?:(?:"public"|public)\\.)?"?${name}"?(?![A-Za-z0-9_])`;
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

function droppedArgs(statement: string, name: string): string[] | "bare" | null {
  if (!/^DROP\s+(?:FUNCTION|ROUTINE)\b/i.test(statement)) return null;
  const re = new RegExp(`${functionPattern(name)}\\s*(\\(([^)]*)\\))?`, "gi");
  const found: Array<string | null> = [];
  for (const match of statement.matchAll(re)) {
    found.push(match[1] ? normalizeArgs(match[2] ?? "") : null);
  }
  if (found.length === 0) return null;
  if (found.some((args) => args === null)) return "bare";
  return found.filter((args): args is string => args !== null);
}

function grantTargets(
  statement: string,
  name: string
): {
  allPublic: boolean;
  args: string[];
  bare: boolean;
} {
  const allInSchema = statement.match(
    /\bON\s+ALL\s+(?:FUNCTIONS|ROUTINES)\s+IN\s+SCHEMA\s+(.+?)\s+\b(?:TO|FROM)\b/i
  );
  const allPublic = Boolean(allInSchema && /(?:^|[\s,])"?public"?\b/i.test(allInSchema[1] ?? ""));
  const list = statement.match(/\bON\s+(?:FUNCTION|ROUTINE)\s+([\s\S]*?)\s+\b(?:TO|FROM)\b/i);
  const args: string[] = [];
  let bare = false;
  const itemPattern = new RegExp(`^${functionPattern(name)}\\s*(\\(([^)]*)\\))?\\s*$`, "i");
  for (const item of splitCommaList(list?.[1] ?? "")) {
    const match = item.match(itemPattern);
    if (!match) continue;
    if (match[1]) args.push(normalizeArgs(match[2] ?? ""));
    else bare = true;
  }
  return { allPublic, args, bare };
}

function splitCommaList(raw: string): string[] {
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
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function applyRoles(acl: ExecuteAcl, roles: string, turnOn: boolean) {
  if (clauseHas(roles, "PUBLIC")) acl.public = turnOn;
  if (clauseHas(roles, "anon")) acl.anon = turnOn;
  if (clauseHas(roles, "authenticated")) acl.authenticated = turnOn;
  if (clauseHas(roles, "service_role")) acl.serviceRole = turnOn;
}

function doBody(statement: string): string | null {
  const head = statement.match(/^DO\b(?:\s+LANGUAGE\s+[A-Za-z_][A-Za-z0-9_]*)?/i);
  if (!head) return null;
  const rest = statement.slice(head[0].length).trim();
  if (rest.startsWith("'")) {
    const quoted = /^'((?:''|[^'])*)'/.exec(rest);
    return quoted?.[1]?.replace(/''/g, "'") ?? null;
  }
  const dollar = /^(\$[A-Za-z0-9_]*\$)/.exec(rest);
  if (!dollar?.[1]) return null;
  const end = rest.indexOf(dollar[1], dollar[1].length);
  if (end === -1) return null;
  return rest.slice(dollar[1].length, end);
}

function keywordTail(statement: string): string | null {
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
    if (/^(CREATE|DROP|GRANT|REVOKE|ALTER)\b/i.test(statement.slice(i))) {
      return statement.slice(i);
    }
    i += 1;
  }
  return null;
}

function applyStatement(statement: string, name: string, byArgs: Map<string, ExecuteAcl>) {
  const collapsed = statement.replace(/\s+/g, " ").trim();
  if (/^DO\b/i.test(collapsed)) {
    const inner = doBody(statement);
    if (!inner) return;
    for (const part of splitSql(inner)) {
      const tail = keywordTail(part);
      if (tail) applyStatement(tail, name, byArgs);
    }
    return;
  }
  if (applyAlter(collapsed, name, byArgs)) return;
  const created = createdSignature(collapsed, name);
  if (created) {
    const existing = byArgs.get(created.args);
    if (!(created.replace && existing)) byArgs.set(created.args, defaultAcl());
    return;
  }
  const dropped = droppedArgs(collapsed, name);
  if (dropped === "bare") {
    if (byArgs.size === 1) byArgs.clear();
    return;
  }
  if (dropped) {
    for (const args of dropped) byArgs.delete(args);
    return;
  }
  if (/^REVOKE\s+GRANT\s+OPTION\s+FOR\b/i.test(collapsed)) return;
  if (!/^GRANT\b/i.test(collapsed) && !/^REVOKE\b/i.test(collapsed)) return;
  const target = grantTargets(collapsed, name);
  if (!target.allPublic && target.args.length === 0 && !target.bare) return;
  const roles = roleClause(collapsed);
  if (!roles) return;
  const keys = target.allPublic
    ? [...byArgs.keys()]
    : [...target.args, ...(target.bare && byArgs.size === 1 ? [...byArgs.keys()] : [])];
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

function removeSignature(byArgs: Map<string, ExecuteAcl>, args: string | null) {
  if (args === null) {
    if (byArgs.size === 1) byArgs.clear();
    return;
  }
  byArgs.delete(args);
}

function applyAlter(statement: string, name: string, byArgs: Map<string, ExecuteAcl>): boolean {
  if (!/^ALTER\s+(?:FUNCTION|ROUTINE)\b/i.test(statement)) return false;
  const match = statement.match(new RegExp(`${functionPattern(name)}\\s*(\\(([^)]*)\\))?`, "i"));
  if (!match) return true;
  const args = match[1] ? normalizeArgs(match[2] ?? "") : null;
  const rename = statement.match(/\bRENAME\s+TO\s+("?[A-Za-z_][A-Za-z0-9_]*"?)/i);
  if (rename?.[1] && rename[1].replace(/"/g, "").toLowerCase() !== name.toLowerCase()) {
    removeSignature(byArgs, args);
  }
  const schema = statement.match(/\bSET\s+SCHEMA\s+("?[A-Za-z_][A-Za-z0-9_]*"?)/i);
  if (schema?.[1] && schema[1].replace(/"/g, "").toLowerCase() !== "public") {
    removeSignature(byArgs, args);
  }
  return true;
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
    const doRecreate = `${base}
DO $$
BEGIN
  DROP FUNCTION public.get_weekly_funnel(integer);
  CREATE FUNCTION public.get_weekly_funnel(weeks integer) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
END $$;`;
    expect(memberCanExecute(replayExecuteAcl(doRecreate, "get_weekly_funnel"))).toBe(true);
    const routine = `${base}
GRANT EXECUTE ON ROUTINE public.get_weekly_funnel(integer) TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(routine, "get_weekly_funnel"))).toBe(true);
    const secondTarget = `${base}
GRANT EXECUTE ON FUNCTION public.other_fn(), public.get_weekly_funnel(integer) TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(secondTarget, "get_weekly_funnel"))).toBe(true);
    const bare = `${base}
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(bare, "get_weekly_funnel"))).toBe(true);
    const intAlias = `${base}
DROP FUNCTION public.get_weekly_funnel(int);
CREATE OR REPLACE FUNCTION public.get_weekly_funnel(weeks integer) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`;
    expect(memberCanExecute(replayExecuteAcl(intAlias, "get_weekly_funnel"))).toBe(true);
    const quotedDo = `${base}
DO 'BEGIN GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated; END';`;
    expect(memberCanExecute(replayExecuteAcl(quotedDo, "get_weekly_funnel"))).toBe(true);
    const procedures = `${base}
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(procedures, "get_weekly_funnel"))).toBe(false);
    const doStringWithDollar = `${base}
DO 'BEGIN
  DROP FUNCTION public.get_weekly_funnel(integer);
  CREATE FUNCTION public.get_weekly_funnel(weeks integer) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
END';`;
    expect(memberCanExecute(replayExecuteAcl(doStringWithDollar, "get_weekly_funnel"))).toBe(true);
    const renamed = `${base}
ALTER FUNCTION public.get_weekly_funnel(integer) RENAME TO get_weekly_funnel_old;
CREATE OR REPLACE FUNCTION public.get_weekly_funnel(weeks integer) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`;
    expect(memberCanExecute(replayExecuteAcl(renamed, "get_weekly_funnel"))).toBe(true);
    const outArg = `${base}
DROP FUNCTION public.get_weekly_funnel(weeks integer, OUT week_start date);
CREATE OR REPLACE FUNCTION public.get_weekly_funnel(weeks integer) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`;
    expect(memberCanExecute(replayExecuteAcl(outArg, "get_weekly_funnel"))).toBe(true);
    const outReplace = `${base}
CREATE OR REPLACE FUNCTION public.get_weekly_funnel(weeks integer, OUT week_start date) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`;
    expect(memberCanExecute(replayExecuteAcl(outReplace, "get_weekly_funnel"))).toBe(false);
  });
});
