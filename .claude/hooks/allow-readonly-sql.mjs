/**
 * PreToolUse フック: Supabase MCP の execute_sql が読み取り専用クエリ（SELECT 等）のときだけ
 * 自動許可する。それ以外は何も出力せず、通常の許可確認に委ねる。
 *
 * permissions.allow の MCP ルールはツール単位でしか書けず引数（query）で絞れないため、
 * フックで判定している。判定ロジックは readonly-sql.mjs を参照。
 * このフックは利便性のためのもので、書き込み防止の実体は MCP サーバー側の read-only 設定
 * （README「Claude Code から Supabase MCP を使う」）に置く。
 */

import { isReadOnlyQuery } from "./readonly-sql.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

let input;
try {
  input = JSON.parse(await readStdin());
} catch {
  process.exit(0); // 解析できなければ通常の確認に委ねる
}

if (isReadOnlyQuery(input?.tool_input?.query)) {
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
