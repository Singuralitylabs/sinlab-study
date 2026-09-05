/**
 * PreToolUse フック: Supabase MCP の execute_sql が読み取り専用クエリ（SELECT 等）のときだけ
 * 自動許可する。書き込みを含む可能性があるクエリは何も出力せず、通常の許可確認に委ねる。
 *
 * permissions.allow の MCP ルールはツール単位（mcp__Supabase__execute_sql）でしか書けず、
 * 引数（query の中身）で絞れないため、フックで判定している。
 * 判定は保守的（疑わしければ確認に回す）。SELECT 内で副作用のある関数を呼ぶケースまでは防げないので、
 * 本当に書き込みを防ぎたい場合は MCP サーバー側の read_only 設定を併用すること。
 */

const WRITE_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "merge",
  "truncate",
  "drop",
  "alter",
  "create",
  "grant",
  "revoke",
  "copy",
  "into",
  "call",
  "do",
  "set",
  "reset",
  "lock",
  "refresh",
  "vacuum",
  "cluster",
  "reindex",
  "comment",
  "security",
  "notify",
  "listen",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "prepare",
  "execute",
  "deallocate",
  "discard",
  "load",
  "import",
];

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function stripStringLiterals(sql) {
  // 文字列リテラル内のキーワードを誤検知しないよう除去する
  return sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, " ").replace(/'(?:[^']|'')*'/g, " ");
}

function isReadOnlyQuery(rawQuery) {
  if (typeof rawQuery !== "string") return false;
  const sql = stripStringLiterals(stripComments(rawQuery)).trim().toLowerCase();
  if (sql.length === 0) return false;

  // 複数ステートメント（末尾のセミコロンは許容）
  if (sql.replace(/;\s*$/, "").includes(";")) return false;

  // SELECT / WITH ... SELECT / EXPLAIN（ANALYZE なし）/ SHOW / TABLE / VALUES のみ
  if (!/^(select|with|explain|show|table|values)\b/.test(sql)) return false;
  if (/^explain\b[\s\S]*\banalyze\b/.test(sql)) return false;

  // 行ロックは書き込み扱い
  if (/\bfor\s+(update|no\s+key\s+update|share|key\s+share)\b/.test(sql)) return false;

  const wordPattern = new RegExp(`\\b(${WRITE_KEYWORDS.join("|")})\\b`);
  return !wordPattern.test(sql);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return; // 解析できなければ通常の確認に委ねる
  }
  const query = input?.tool_input?.query;
  if (!isReadOnlyQuery(query)) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason:
          "read-only SQL (SELECT) auto-approved by .claude/hooks/allow-readonly-sql.mjs",
      },
    })
  );
}

await main();
