/**
 * Verifies that a change only touches comments: for every changed TS/JS file, the AST (comments and
 * positions excluded) must be identical before and after.
 *
 * Comments that change tool behavior (`@ts-*`, `biome-ignore*`, `allow-console`) are not free-form:
 * adding or removing one counts as a change. Their reason text may be reworded. Moving one to a
 * different line is NOT detected (a misplaced suppression is caught by tsc / Biome instead).
 *
 * Usage: bun scripts/check-comment-only-diff.ts [baseRef=origin/main]
 * Exits non-zero and lists the offending files if any file differs, fails to parse, or was
 * added/deleted (untracked files included). Other changed files (SQL, JSON, ...) are only listed as
 * unverified. Can be run from any directory inside the repository.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// Positions, comment attachments and `extra` (raw source text, parenthesization) vary with
// formatting/comments without changing semantics. `{/* c */}` parses as an empty JSX expression
// container and is dropped so that removing such a comment is AST-neutral.
const IGNORED_KEYS = new Set([
  "start",
  "end",
  "loc",
  "range",
  "extra",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments",
]);

// React drops whitespace-only lines and trims line edges in JSX text, so text that differs only in
// such whitespace renders identically. Each text node is cleaned on its own: removing an own-line
// `{/* c */}` between "foo" and "bar" renders "foobar", while merging them first would render
// "foo bar" and hide the visible change.
function cleanJsxText(text: string): string {
  const lines = text.split(/\r\n|\n|\r/);
  const kept: string[] = [];
  lines.forEach((line, i) => {
    let l = line.replace(/\t/g, " ");
    if (i !== 0) l = l.replace(/^ +/, "");
    if (i !== lines.length - 1) l = l.replace(/ +$/, "");
    if (l) kept.push(l);
  });
  return kept.join(" ");
}

type AstNode = { type?: string; value?: string; [key: string]: unknown };

function normalizeJsxChildren(items: AstNode[]): AstNode[] {
  const out: AstNode[] = [];
  for (const item of items) {
    if (item?.type !== "JSXText") {
      out.push(item);
      continue;
    }
    const value = cleanJsxText(item.value ?? "");
    const prev = out[out.length - 1];
    if (prev?.type === "JSXText") {
      prev.value = `${prev.value}${value}`;
    } else {
      out.push({ ...item, value });
    }
  }
  return out.filter((item) => !(item?.type === "JSXText" && item.value === ""));
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) {
    return normalizeJsxChildren(
      value.filter(
        (v) =>
          !(v?.type === "JSXExpressionContainer" && v.expression?.type === "JSXEmptyExpression")
      )
    ).map(strip);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!IGNORED_KEYS.has(k)) out[k] = strip(v);
    }
    return out;
  }
  return value;
}

// Only the directive itself (and the biome rule name) is compared, not the trailing reason.
const PRAGMA =
  /^[\s*]*(@ts-(?:ignore|expect-error|nocheck|check)|biome-ignore(?:-all|-start|-end)?\s+[\w/]+|allow-console)/;

function parseSource(source: string) {
  return parse(source, {
    sourceType: "module",
    allowReturnOutsideFunction: true,
    plugins: ["typescript", "jsx"],
  });
}

export function normalize(source: string): string {
  return JSON.stringify(strip(parseSource(source).program));
}

export function pragmas(source: string): string {
  const found = (parseSource(source).comments ?? [])
    .map((c) => PRAGMA.exec(c.value)?.[1].replace(/\s+/g, " "))
    .filter((p): p is string => Boolean(p));
  return JSON.stringify(found.sort());
}

function changedFiles(mergeBase: string): { status: string; file: string }[] {
  // -z: paths with spaces or non-ASCII characters are otherwise quoted and silently skipped.
  const tokens = git(["diff", "--name-status", "--no-renames", "-z", mergeBase])
    .split("\0")
    .filter(Boolean);
  const files: { status: string; file: string }[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    files.push({ status: tokens[i], file: tokens[i + 1] });
  }
  // `git diff` ignores untracked files, so a not-yet-added new file would pass unnoticed.
  for (const file of git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)) {
    files.push({ status: "A", file });
  }
  return files;
}

function main(): void {
  // git prints repo-root-relative paths; make file reads independent of the caller's cwd.
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());
  const base = process.argv[2] ?? "origin/main";
  const mergeBase = git(["merge-base", base, "HEAD"]).trim();
  const all = changedFiles(mergeBase);
  const changed = all.filter(({ file }) => CODE_FILE.test(file));
  const unverified = all.filter(({ file }) => !CODE_FILE.test(file));

  const offenders: string[] = [];
  for (const { status, file } of changed) {
    if (status === "A" || status === "D") {
      offenders.push(`${file} (${status === "A" ? "added" : "deleted"})`);
      continue;
    }
    if (status !== "M") {
      offenders.push(`${file} (status ${status})`);
      continue;
    }
    try {
      const beforeSource = git(["show", `${mergeBase}:${file}`]);
      const afterSource = readFileSync(file, "utf8");
      if (normalize(beforeSource) !== normalize(afterSource)) {
        offenders.push(`${file} (AST differs)`);
      } else if (pragmas(beforeSource) !== pragmas(afterSource)) {
        offenders.push(`${file} (tool pragma comments differ)`);
      }
    } catch (error) {
      offenders.push(`${file} (cannot verify: ${(error as Error).message.split("\n")[0]})`);
    }
  }

  if (unverified.length > 0) {
    const names = unverified.map(({ file }) => file);
    const shown = names.slice(0, 10).join(", ");
    console.log(
      `Note: ${names.length} other changed file(s) not verified: ${shown}${names.length > 10 ? ", ..." : ""}`
    );
  }

  if (offenders.length > 0) {
    console.error(`Non-comment changes detected in ${offenders.length} file(s):`);
    for (const o of offenders) console.error(`  - ${o}`);
    process.exit(1);
  }
  console.log(`OK: ${changed.length} changed code file(s) differ only in comments/formatting.`);
}

if (import.meta.main) main();
