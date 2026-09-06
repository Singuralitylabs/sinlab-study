/**
 * SQL 文字列が「読み取り専用」と判定できるかを返す。PreToolUse フック
 * （allow-readonly-sql.mjs）から使う純粋関数。テストは tests/hooks/readonly-sql.test.ts。
 *
 * 判定は保守的で、迷ったら false（= 通常の許可確認に回す）。
 * 字句解析は正規表現の多段適用ではなく 1 パスの状態機械で行う。
 * （'...' / E'...' / $tag$...$tag$ / "..." / -- / 入れ子の block comment を順に読み進め、
 *  コメント・リテラルの入れ子で `;` や DML を隠す回避を防ぐため。）
 *
 * 既知の限界: SELECT の中で副作用のある関数（setval, set_config, pg_terminate_backend 等）を
 * 呼ぶケースは検出しない。書き込みを確実に防ぐには MCP サーバー側の read-only 設定を併用する
 * （README「Claude Code から Supabase MCP を使う」参照）。
 */

const ALLOWED_HEAD = /^(select|with|explain|show|table|values)\b/;
const ROW_LOCK = /\bfor\s+(update|no\s+key\s+update|share|key\s+share)\b/;
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
  "unlisten",
  "begin",
  "start",
  "commit",
  "rollback",
  "savepoint",
  "release",
  "prepare",
  "execute",
  "deallocate",
  "discard",
  "load",
  "import",
];
const WRITE_KEYWORD = new RegExp(`\\b(${WRITE_KEYWORDS.join("|")})\\b`);

const isIdentChar = (ch) => /[A-Za-z0-9_]/.test(ch);

/**
 * コメントと文字列リテラル・引用識別子を空白 1 文字に置き換えた SQL を返す。
 * 閉じられていないコメント・リテラルがあれば null（呼び出し側で「読み取り専用ではない」扱い）。
 */
export function stripCommentsAndLiterals(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // 行コメント
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? n : end; // 改行自体は残す
      out += " ";
      continue;
    }

    // ブロックコメント（PostgreSQL は入れ子を許す）
    if (ch === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      if (depth > 0) return null;
      out += " ";
      continue;
    }

    // 文字列リテラル。直前が単独の E/e なら C 形式のバックスラッシュエスケープを持つ
    if (ch === "'") {
      const prev = sql[i - 1];
      const beforePrev = sql[i - 2];
      const isEscapeString =
        (prev === "E" || prev === "e") && (beforePrev === undefined || !isIdentChar(beforePrev));
      i++;
      let closed = false;
      while (i < n) {
        if (isEscapeString && sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2; // '' はエスケープされた引用符
            continue;
          }
          closed = true;
          i++;
          break;
        }
        i++;
      }
      if (!closed) return null;
      out += " ";
      continue;
    }

    // 引用識別子 "..."（"" はエスケープされた引用符）
    if (ch === '"') {
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        i++;
      }
      if (!closed) return null;
      out += " ";
      continue;
    }

    // ドル引用 $tag$ ... $tag$（tag は空でもよい）
    if (ch === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) return null;
        i = end + tag.length;
        out += " ";
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

export function isReadOnlyQuery(rawQuery) {
  if (typeof rawQuery !== "string") return false;
  const stripped = stripCommentsAndLiterals(rawQuery);
  if (stripped === null) return false;

  const sql = stripped.trim().toLowerCase();
  if (sql.length === 0) return false;

  // 複数ステートメント（末尾のセミコロンは許容）
  if (sql.replace(/;\s*$/, "").includes(";")) return false;

  if (!ALLOWED_HEAD.test(sql)) return false;
  if (/^explain\b[\s\S]*\banalyze\b/.test(sql)) return false;
  if (ROW_LOCK.test(sql)) return false;

  return !WRITE_KEYWORD.test(sql);
}
