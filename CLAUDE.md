@AGENTS.md

# CLAUDE.md

共通ルールは `AGENTS.md`（上でインポート）にある。ここには Claude Code 固有の設定だけを置く。編集は `AGENTS.md` の「このファイルの編集方針」に従う（`/init` で本文を再生成しない）。

## 自動実行の許可

`.claude/settings.json`（コミット対象）の `permissions.allow` に登録されたコマンドは、**事前確認なし**で実行してよい。許可範囲は同ファイルを編集して変える（ここに書いても増えない）。個人用は `.claude/settings.local.json`（gitignore済み）。

**allow に入れてよいのは、参照・データ取得系とローカルで完結する作業補助のみ。** 外部CLI（`supabase`・`vercel`）はサブコマンド単位で登録し、サーバー側を更新するもの（`supabase db push`、`vercel deploy` 等）と `git push` は登録しない。

**Supabase MCP の `execute_sql` は allow に入れない**（読み取り専用の自動許可は PreToolUse フック `.claude/hooks/allow-readonly-sql.mjs`、接続設定は `README.md`「Claude Code から Supabase MCP を使う」）。
