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
const parkedOf = new WeakMap<Map<string, ExecuteAcl>, Map<string, ExecuteAcl>>();
const grantedToOf = new WeakMap<Map<string, ExecuteAcl>, Map<string, Set<string>>>();
const holdersOf = new WeakMap<ExecuteAcl, Set<string>>();

function defaultAcl(): ExecuteAcl {
  return { anon: true, authenticated: true, public: true, serviceRole: true };
}

function normalizeArgs(raw: string): string {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const next = skipLiteral(raw, i);
    if (next !== i) {
      current += raw.slice(i, next);
      i = next - 1;
      continue;
    }
    const ch = raw[i] ?? "";
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
    if (sql[i] === "'" || /^E'/i.test(sql.slice(i)) || /^U&'/i.test(sql.slice(i))) {
      const end = consumeString(sql, i);
      current += sql.slice(i, end);
      i = end;
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
  return `(?:(?:"public"|public)\\s*\\.\\s*)?"?${name}"?(?![A-Za-z0-9_])`;
}

function skipLiteral(text: string, index: number): number {
  if (text[index] === "'" || /^E'/i.test(text.slice(index)) || /^U&'/i.test(text.slice(index))) {
    return consumeString(text, index);
  }
  const dollar = /^\$[A-Za-z0-9_]*\$/.exec(text.slice(index));
  if (!dollar) return index;
  const close = text.indexOf(dollar[0], index + dollar[0].length);
  if (close === -1) return index;
  return close + dollar[0].length;
}

function balancedParens(text: string): { inner: string; rest: string } | null {
  if (!text.startsWith("(")) return null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const next = skipLiteral(text, i);
    if (next !== i) {
      i = next - 1;
      continue;
    }
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(1, i), rest: text.slice(i + 1) };
    }
  }
  return null;
}

function argsOf(text: string): { present: boolean; args: string; rest: string } {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("(")) return { present: false, args: "", rest: text };
  const parsed = balancedParens(trimmed);
  if (!parsed) return { present: false, args: "", rest: text };
  return { present: true, args: normalizeArgs(parsed.inner), rest: parsed.rest };
}

function createdSignature(
  statement: string,
  name: string
): { args: string; replace: boolean; schema: string } | null {
  const match = statement.match(
    new RegExp(
      `^CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:("?[A-Za-z_]\\w*"?)\\s*\\.\\s*)?"?${name}"?(?![A-Za-z0-9_])\\s*`,
      "i"
    )
  );
  if (!match) return null;
  const parsed = argsOf(statement.slice(match[0].length));
  if (!parsed.present) return null;
  return {
    replace: Boolean(match[1]),
    schema: (match[2] ?? "public").replace(/"/g, "").toLowerCase(),
    args: parsed.args,
  };
}

function droppedArgs(statement: string, name: string): string[] | "bare" | null {
  if (!/^DROP\s+(?:FUNCTION|ROUTINE)\b/i.test(statement)) return null;
  const re = new RegExp(functionPattern(name), "gi");
  const found: Array<string | null> = [];
  for (const match of statement.matchAll(re)) {
    const parsed = argsOf(statement.slice((match.index ?? 0) + match[0].length));
    found.push(parsed.present ? parsed.args : null);
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
  const itemHead = new RegExp(`^${functionPattern(name)}\\s*`, "i");
  for (const item of splitCommaList(list?.[1] ?? "")) {
    const match = item.match(itemHead);
    if (!match) continue;
    const parsed = argsOf(item.slice(match[0].length));
    if (parsed.present && parsed.rest.trim() === "") args.push(parsed.args);
    else if (!parsed.present && item.slice(match[0].length).trim() === "") bare = true;
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

function roleNames(clause: string): string[] {
  return clause
    .replace(/\bWITH\s+GRANT\s+OPTION\b/gi, "")
    .split(",")
    .map((role) => role.trim().replace(/"/g, "").split(/\s+/)[0] ?? "")
    .filter((role) => role.length > 0);
}

function applyRoles(acl: ExecuteAcl, roles: string, turnOn: boolean) {
  if (clauseHas(roles, "PUBLIC")) acl.public = turnOn;
  if (clauseHas(roles, "anon")) acl.anon = turnOn;
  if (clauseHas(roles, "authenticated")) acl.authenticated = turnOn;
  if (clauseHas(roles, "service_role")) acl.serviceRole = turnOn;
  const holders = holdersOf.get(acl) ?? new Set<string>();
  for (const role of roleNames(roles)) {
    const key = role.toLowerCase();
    if (key === "public" || key === "anon" || key === "authenticated" || key === "service_role") {
      continue;
    }
    if (turnOn) holders.add(key);
    else holders.delete(key);
  }
  holdersOf.set(acl, holders);
}

function consumeString(sql: string, start: number): number {
  let i = start;
  let extended = false;
  if (/^E'/i.test(sql.slice(i))) {
    extended = true;
    i += 2;
  } else if (/^U&'/i.test(sql.slice(i))) {
    i += 3;
  } else if (sql[i] === "'") {
    i += 1;
  } else {
    return start;
  }
  while (i < sql.length) {
    if (extended && sql[i] === "\\") {
      i += 2;
      continue;
    }
    if (sql[i] === "'" && sql[i + 1] === "'") {
      i += 2;
      continue;
    }
    if (sql[i] === "'") return i + 1;
    i += 1;
  }
  return i;
}

function readStringValue(sql: string): { value: string; rest: string } | null {
  if (!sql.startsWith("'") && !/^E'/i.test(sql) && !/^U&'/i.test(sql)) return null;
  const end = consumeString(sql, 0);
  if (end <= 0) return null;
  let raw = sql.slice(0, end);
  const extended = /^E'/i.test(raw);
  raw = raw.replace(/^(?:E|U&)?'/i, "").replace(/'$/, "");
  let value = "";
  let i = 0;
  while (i < raw.length) {
    if (extended && raw[i] === "\\") {
      value += raw[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (raw[i] === "'" && raw[i + 1] === "'") {
      value += "'";
      i += 2;
      continue;
    }
    value += raw[i];
    i += 1;
  }
  return { value, rest: sql.slice(end) };
}

function doBody(statement: string): string | null {
  const head = statement.match(/^DO\b(?:\s+LANGUAGE\s+[A-Za-z_][A-Za-z0-9_]*)?/i);
  if (!head) return null;
  let rest = statement.slice(head[0].length).trim();
  if (/^\$[A-Za-z0-9_]*\$/.test(rest)) {
    const dollar = /^(\$[A-Za-z0-9_]*\$)/.exec(rest);
    if (!dollar?.[1]) return null;
    const end = rest.indexOf(dollar[1], dollar[1].length);
    if (end === -1) return null;
    return rest.slice(dollar[1].length, end);
  }
  const first = readStringValue(rest);
  if (!first) return null;
  let value = first.value;
  rest = first.rest.trim();
  while (rest.startsWith("'") || /^E'/i.test(rest) || /^U&'/i.test(rest)) {
    const more = readStringValue(rest);
    if (!more) break;
    value += more.value;
    rest = more.rest.trim();
  }
  return value;
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
    if (
      statement[i] === "'" ||
      /^E'/i.test(statement.slice(i)) ||
      /^U&'/i.test(statement.slice(i))
    ) {
      i = consumeString(statement, i);
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
  if (/^UPDATE\s+pg_proc\b/i.test(collapsed) && /\bproacl\s*=\s*NULL\b/i.test(collapsed)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(collapsed)) {
      for (const key of [...byArgs.keys()]) byArgs.set(key, defaultAcl());
    }
    return;
  }
  if (applyRoleGrant(collapsed, byArgs)) return;
  if (applyAlter(collapsed, name, byArgs)) return;
  const created = createdSignature(collapsed, name);
  if (created) {
    const parked = parkedOf.get(byArgs);
    if (created.schema === "public" || !parked) {
      const existing = byArgs.get(created.args);
      if (!(created.replace && existing)) byArgs.set(created.args, defaultAcl());
    } else {
      const key = `${created.schema}:${created.args}`;
      const existing = parked.get(key);
      if (!(created.replace && existing)) parked.set(key, defaultAcl());
    }
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

function applyRoleGrant(statement: string, byArgs: Map<string, ExecuteAcl>): boolean {
  if (!/^(GRANT|REVOKE)\b/i.test(statement) || /\bON\b/i.test(statement)) return false;
  const grantedTo = grantedToOf.get(byArgs);
  if (!grantedTo) return true;
  const grant = statement.match(/^GRANT\s+(.+?)\s+TO\s+(.+)$/i);
  const revoke = statement.match(/^REVOKE\s+(.+?)\s+FROM\s+(.+)$/i);
  const parsed = grant ?? revoke;
  if (!parsed?.[1] || !parsed[2]) return true;
  for (const role of roleNames(parsed[1])) {
    const key = role.toLowerCase();
    const grantees = grantedTo.get(key) ?? new Set<string>();
    for (const grantee of roleNames(parsed[2])) {
      if (grant) grantees.add(grantee.toLowerCase());
      else grantees.delete(grantee.toLowerCase());
    }
    grantedTo.set(key, grantees);
  }
  return true;
}

function reachesMember(
  role: string,
  grantedTo: Map<string, Set<string>>,
  seen = new Set<string>()
): boolean {
  const key = role.toLowerCase();
  if (key === "public" || key === "anon" || key === "authenticated") return true;
  if (seen.has(key)) return false;
  seen.add(key);
  for (const grantee of grantedTo.get(key) ?? []) {
    if (reachesMember(grantee, grantedTo, seen)) return true;
  }
  return false;
}

function applyAlter(statement: string, name: string, byArgs: Map<string, ExecuteAcl>): boolean {
  if (!/^ALTER\s+(?:FUNCTION|ROUTINE)\b/i.test(statement)) return false;
  const parked = parkedOf.get(byArgs) ?? new Map<string, ExecuteAcl>();
  const source = statement.match(
    new RegExp(
      `^ALTER\\s+(?:FUNCTION|ROUTINE)\\s+(?:("?[A-Za-z_]\\w*"?)\\s*\\.\\s*)?"?${name}"?(?![A-Za-z0-9_])\\s*`,
      "i"
    )
  );
  if (source) {
    const schema = (source[1] ?? "public").replace(/"/g, "").toLowerCase();
    const parsed = argsOf(statement.slice(source[0].length));
    const action = parsed.rest.match(
      /^\s*(?:RENAME\s+TO\s+("?[A-Za-z_]\w*"?)|SET\s+SCHEMA\s+("?[A-Za-z_]\w*"?))/i
    );
    const args = parsed.present ? parsed.args : null;
    const renameTo = action?.[1]?.replace(/"/g, "").toLowerCase();
    const nextSchema = action?.[2]?.replace(/"/g, "").toLowerCase();
    if (renameTo && renameTo !== name.toLowerCase() && schema === "public") {
      removeSignature(byArgs, args);
    }
    if (nextSchema && schema === "public" && nextSchema !== "public" && args !== null) {
      const current = byArgs.get(args);
      if (current) parked.set(`${nextSchema}:${args}`, current);
      byArgs.delete(args);
    }
    if (nextSchema === "public" && schema !== "public") {
      const parkedKeys =
        args !== null
          ? [`${schema}:${args}`]
          : [...parked.keys()].filter((key) => key.startsWith(`${schema}:`));
      if (args !== null || parkedKeys.length === 1) {
        for (const key of parkedKeys) {
          byArgs.set(key.slice(schema.length + 1), parked.get(key) ?? defaultAcl());
          parked.delete(key);
        }
      }
    }
    return true;
  }
  const onto = statement.match(
    /^ALTER\s+(?:FUNCTION|ROUTINE)\s+(?:(?:"?[A-Za-z_]\w*"?)\s*\.\s*)?"?([A-Za-z_]\w*)"?\s*/i
  );
  if (onto?.[1] && onto[1].toLowerCase() !== name.toLowerCase()) {
    const parsed = argsOf(statement.slice(onto[0].length));
    const rename = parsed.rest.match(
      new RegExp(`^\\s*RENAME\\s+TO\\s+"?${name}"?(?![A-Za-z0-9_])`, "i")
    );
    if (rename) byArgs.set(parsed.present ? parsed.args : "", defaultAcl());
  }
  return true;
}

function replayExecuteAcl(sql: string, name: string): Map<string, ExecuteAcl> {
  const byArgs = new Map<string, ExecuteAcl>();
  parkedOf.set(byArgs, new Map());
  grantedToOf.set(byArgs, new Map());
  for (const statement of splitSql(sql)) applyStatement(statement, name, byArgs);
  return byArgs;
}

function memberCanExecute(byArgs: Map<string, ExecuteAcl>): boolean {
  const grantedTo = grantedToOf.get(byArgs) ?? new Map<string, Set<string>>();
  for (const acl of byArgs.values()) {
    if (acl.anon || acl.authenticated || acl.public) return true;
    if (acl.serviceRole && reachesMember("service_role", grantedTo)) return true;
    for (const holder of holdersOf.get(acl) ?? []) {
      if (reachesMember(holder, grantedTo)) return true;
    }
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
    const renameOnto = `${base}
ALTER FUNCTION public.get_weekly_funnel(integer) RENAME TO get_weekly_funnel_old;
CREATE FUNCTION public.get_weekly_funnel_next(weeks integer) RETURNS integer LANGUAGE sql AS $$ SELECT weeks $$;
ALTER FUNCTION public.get_weekly_funnel_next(integer) RENAME TO get_weekly_funnel;`;
    expect(memberCanExecute(replayExecuteAcl(renameOnto, "get_weekly_funnel"))).toBe(true);
    const moveIn = `${base}
CREATE SCHEMA IF NOT EXISTS private;
DROP FUNCTION public.get_weekly_funnel(integer);
CREATE FUNCTION private.get_weekly_funnel(weeks integer) RETURNS integer LANGUAGE sql AS $$ SELECT weeks $$;
ALTER FUNCTION private.get_weekly_funnel(integer) SET SCHEMA public;`;
    expect(memberCanExecute(replayExecuteAcl(moveIn, "get_weekly_funnel"))).toBe(true);
    const extendedDo = `${base}
DO E'BEGIN GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated; END';`;
    expect(memberCanExecute(replayExecuteAcl(extendedDo, "get_weekly_funnel"))).toBe(true);
    const adjacent = `${base}
DO 'BEGIN '
'GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated; '
'END';`;
    expect(memberCanExecute(replayExecuteAcl(adjacent, "get_weekly_funnel"))).toBe(true);
    const escaped = `${base}
SELECT E'O\\'Brien';
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(escaped, "get_weekly_funnel"))).toBe(true);
    const inherited = `${base}
CREATE ROLE funnel_reader NOLOGIN;
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(integer) TO funnel_reader;
GRANT funnel_reader TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(inherited, "get_weekly_funnel"))).toBe(true);
    const clearedAcl = `${base}
UPDATE pg_proc SET proacl = NULL WHERE proname = 'get_weekly_funnel' AND pronamespace = 'public'::regnamespace;`;
    expect(memberCanExecute(replayExecuteAcl(clearedAcl, "get_weekly_funnel"))).toBe(true);
    const inheritService = `${base}
GRANT service_role TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(inheritService, "get_weekly_funnel"))).toBe(true);
    const bareMove = `${base}
DROP FUNCTION public.get_weekly_funnel(integer);
CREATE FUNCTION private.get_weekly_funnel(weeks integer) RETURNS integer LANGUAGE sql AS $$ SELECT weeks $$;
ALTER FUNCTION private.get_weekly_funnel SET SCHEMA public;`;
    expect(memberCanExecute(replayExecuteAcl(bareMove, "get_weekly_funnel"))).toBe(true);
    const nestedDefault = `${base}
CREATE OR REPLACE FUNCTION public.get_weekly_funnel(weeks integer DEFAULT (8), tz text DEFAULT 'Asia/Tokyo') RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`;
    expect(memberCanExecute(replayExecuteAcl(nestedDefault, "get_weekly_funnel"))).toBe(true);
    const nestedGrant = `${base}
GRANT EXECUTE ON FUNCTION public.get_weekly_funnel(weeks integer, OUT label varchar(20)) TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(nestedGrant, "get_weekly_funnel"))).toBe(true);
    const spacedSchema = `${base}
GRANT EXECUTE ON FUNCTION public . get_weekly_funnel(integer) TO authenticated;`;
    expect(memberCanExecute(replayExecuteAcl(spacedSchema, "get_weekly_funnel"))).toBe(true);
    const parenInString = `${base}
CREATE OR REPLACE FUNCTION public.get_weekly_funnel(weeks integer DEFAULT length(')'), tz text) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`;
    expect(memberCanExecute(replayExecuteAcl(parenInString, "get_weekly_funnel"))).toBe(true);
  });
});
