/**
 * Verifies that a change only touches comments: for every changed TS/TSX file, the AST (comments and
 * positions excluded) must be identical before and after.
 *
 * Usage: bun scripts/check-comment-only-diff.ts [baseRef=origin/main]
 * Exits non-zero and lists the offending files if any file differs (added/deleted files included).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";

const CODE_FILE = /\.(ts|tsx|mts|cts)$/;

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

function strip(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter(
        (v) =>
          !(v?.type === "JSXExpressionContainer" && v.expression?.type === "JSXEmptyExpression")
      )
      .map(strip);
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

export function normalize(source: string): string {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  return JSON.stringify(strip(ast.program));
}

function main(): void {
  const base = process.argv[2] ?? "origin/main";
  const mergeBase = git(["merge-base", base, "HEAD"]).trim();
  const changed = git(["diff", "--name-status", "--no-renames", mergeBase])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status, file: rest.join("\t") };
    })
    .filter(({ file }) => CODE_FILE.test(file));

  const offenders: string[] = [];
  for (const { status, file } of changed) {
    if (status !== "M") {
      offenders.push(`${file} (${status === "A" ? "added" : "deleted"})`);
      continue;
    }
    const before = normalize(git(["show", `${mergeBase}:${file}`]));
    const after = normalize(readFileSync(file, "utf8"));
    if (before !== after) offenders.push(`${file} (AST differs)`);
  }

  if (offenders.length > 0) {
    console.error(`Non-comment changes detected in ${offenders.length} file(s):`);
    for (const o of offenders) console.error(`  - ${o}`);
    process.exit(1);
  }
  console.log(`OK: ${changed.length} changed TS/TSX file(s) differ only in comments/formatting.`);
}

if (import.meta.main) main();
