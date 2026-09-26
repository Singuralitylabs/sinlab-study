@AGENTS.md

# CLAUDE.md

AIコーディングエージェント共通のルールは上でインポートしている `AGENTS.md` にある。このファイルには Claude Code 固有の設定だけを置く。編集するときは `AGENTS.md` の「このファイルの編集方針」に従うこと（`/init` で本文を再生成しない）。

## 自動実行の許可

`.claude/settings.json`（チーム共有・コミット対象）の `permissions.allow` に登録されたコマンドは、**事前確認を求めず**タスクの一部として即座に実行してよい。**許可範囲を変えるときは `.claude/settings.json` を編集する**（このファイルの記述を増やしても許可は増えない）。個人用の追加設定は `.claude/settings.local.json`（gitignore済み）に置く。

**allow に入れてよいのは、参照・データ取得系のコマンドとローカルで完結する作業補助のみ。** 外部CLI（`supabase`・`vercel`）はサブコマンド単位で登録し、サーバー側を更新するもの（`supabase db push`、`vercel deploy` 等）は登録しない。`git push` も同様に含めない（`AGENTS.md`「ブランチ運用」のユーザー確認ルールを毎回通すため）。

**Supabase MCP の `execute_sql` は allow に入れない**（読み取り専用クエリの自動許可は PreToolUse フック `.claude/hooks/allow-readonly-sql.mjs`、接続設定は `README.md`「Claude Code から Supabase MCP を使う」を参照）。
