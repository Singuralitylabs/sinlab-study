# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

「AIと学ぶ実践Web技術講座」の学習コンテンツ配信サービス。Next.js 16 App Routerで構築。本サービスは独自のSupabaseプロジェクトを使用し、Google OAuthによるログイン機能とユーザー承認フローを備える。コース教材の配信と受講生の進捗管理を担当する。関連サービスとして**Sinlabポータル**が存在するが、認証基盤は独立している。

## 自動実行の許可

`.claude/settings.local.json` の `allow` リストに登録されているコマンド・ツールはすべて、事前確認なしに即座に実行してよい。これには以下が含まれる：

- `git add`、`git status`、`git checkout`、`git mv`、`git check-ignore` などのgitコマンド
- `bun run`、`bun add`、`bun pm` などのbunコマンド
- `ls`、`find`、`grep`、`cat`、`echo`、`cp`、`mkdir`、`curl`、`lsof` などのシェルコマンド
- `vercel`、`supabase`、`npx supabase`、`gh api` などのCLIコマンド
- 各種MCPツール（serena、supabase、context7等）

これらのコマンドについては「実行してよいですか？」などの確認を求めず、タスクの一部として自動的に実行すること。

## コマンド

```bash
bun dev              # Turbopack使用の開発サーバー起動
bun run build        # 本番ビルド
bun run lint         # Biome リントチェック
bun run format       # Biome フォーマット
bun run check        # リント + フォーマット一括実行
bun run db:types     # Supabase型定義の再生成
bun run test         # Vitestによるユニットテスト実行
bun run test:all     # build/db:types/lint/format/check/test を一括実行
```

## ブランチ運用

- **`main` ブランチへ直接コミット・直接 push してはならない。** バグ修正・機能追加・ドキュメント更新などあらゆる変更は、必ず作業用のブランチを切ってから行うこと。
- ブランチ名は変更内容が分かる接頭辞付きで命名する（例: `feature/...`、`bug/...`、`docs/...`、`refactor/...`、`env/...`）。
- 変更は作業ブランチへコミットし、`main` への反映は必ずプルリクエスト経由で行う。
- `main` への force push は禁止。
- **リモートへ push する前には、対象ブランチを問わず必ずユーザーに確認を取ること。** ユーザーの承認を得てから push を実行する。

## プルリクエスト

PRを作成する際は必ず `.github/pull_request_template.md` のテンプレートに従うこと。
`gh pr create` を使用する場合は `--body` に同テンプレートの全セクションを含めること。

## コードスタイル (Biome)

- ダブルクォート、セミコロン必須、ES5トレイリングカンマ
- インデント2スペース、行幅100文字
- `useConst`、`useImportType`/`useExportType` はerrorレベルで強制
- `noUnusedVariables`/`noUnusedImports` はwarnレベル
- 型のみのインポートには `import type` を使用すること

## アーキテクチャ

### ルート構成 (App Router)

```
app/
├── (auth)/              # 公開ページ（認証不要）
│   ├── login/           # Googleログインページ
│   ├── callback/        # OAuthコールバック（セッション確立 + ユーザー自動登録）
│   └── rejected/        # 却下画面
├── (authenticated)/     # 全ページでアクティブなユーザーセッションが必要
│   ├── admin/           # 管理者専用：フェーズ・週・コンテンツ・受講生・提出物・ユーザー管理
│   ├── learn/           # 学習画面: [phaseId]/[weekId]/[contentId]
│   ├── submissions/     # 受講生の提出履歴
│   └── page.tsx         # 進捗概要付きダッシュボード
├── api/
│   ├── admin/users/     # PATCH: ユーザー承認・却下
│   ├── progress/        # POST: コンテンツごとの進捗をupsert
│   └── submissions/     # POST: コードまたはURLの提出物を作成
```

### 認証・認可フロー

1. **ログイン**: `/login` ページでGoogleログインボタンをクリック → Supabase Auth経由でGoogle OAuth
2. **コールバック**: `/auth/callback` でOAuthコードをセッションに変換。初回ログイン時は `users` テーブルにレコードを自動作成（`status=pending`）し、そのままダッシュボード（`/`）へ遷移
3. **プロキシ** (`proxy.ts`、Next.js 16 における Middleware の後継) が静的ファイル・認証ページ以外の全リクエストをインターセプト
4. Supabaseサーバークライアントを生成し、`getUser()` を呼び出し
5. 未認証・ステータス取得不能（null） → `/login` にリダイレクト（フェイルクローズ）
6. 認証済みだがステータスが `rejected` → `/rejected` にリダイレクト
7. `active` ユーザーと `pending`（お試し）ユーザーがアプリにアクセス可能。お試しユーザーには承認待ちであることをアプリ内バナーで通知（`/pending` 承認待ち画面は廃止。アクセス時は `/` へリダイレクト）
8. **ユーザー管理**: 管理者が `/admin/users` でユーザーの承認・却下を行う

**認可の二層防御**: 未認証・`rejected` のリダイレクト判定はプロキシ（`proxy.ts`）を第一の砦とし、`app/(authenticated)/layout.tsx` でも `userStatus` の許可リスト検証（`active`/`pending` 以外はリダイレクト）を行う。プロキシはフェイルクローズ（環境変数欠落・例外時は `/login` へ）。クライアント側での認証ガードは行わない。
**サーバー側のユーザー情報取得**: layout・page・API Routeでは `getServerAuth()`（`app/services/auth/server-auth.ts`）を使用する。`React.cache()` によりリクエスト単位でメモ化されるため、layoutとpageの双方から呼んでも認証確認・`users` テーブル照会は1リクエストにつき1回しか実行されない。

**ロール**: `admin`（全権限）、`maintainer`（コンテンツ管理）、`member`（受講生）
**権限チェック**: `app/services/auth/` にロールベースの権限チェックロジックを集約

### お試し（trial）ユーザー

承認前ユーザー（`status=pending`）を「**お試し（trial）ユーザー**」と呼ぶ。お試し体験を通じた入会動機の醸成のため、承認前でも通常ログインでき、**お試し公開**指定されたコンテンツのみ閲覧・課題提出できる（DBの status 値 `'pending'` 自体のリネームは #88 で対応予定。新設フラグ名・UI文言には trial 系の名称を用いる）。

- **お試し公開フラグ**: `learning_contents.is_open_to_trial`（`BOOLEAN NOT NULL DEFAULT false`）。コンテンツ編集フォーム（`/manage/contents`、admin/maintainer のみ）のチェックボックス「お試しユーザーにも公開する」で設定する
- **閲覧範囲**: お試しユーザーは `is_open_to_trial=true` かつ `is_published=true` のコンテンツのみ閲覧・進捗登録・提出が可能
- **ロック表示**: コースツリー（テーマ/フェーズ/週/コンテンツ一覧）は全件表示しつつ、お試し非公開のコンテンツは鍵アイコンでロックし中身は見せない。直リンク時はロック画面を表示する
- **ツリー表示のサマリー取得**: RLS強化によりお試し非公開コンテンツのタイトル等が通常クライアントで取得できないため、一覧系のサマリー取得に限り service_role クライアント + カラム許可リスト（`id, title, content_type, display_order, is_open_to_trial` のみ。本文カラムは select しない）で実装する
- **APIのお試し公開チェック**: 提出API（`/api/submissions`）・進捗API（`/api/progress`）でお試しユーザーはお試し公開コンテンツのみ書き込み可（非公開コンテンツへの直叩きは 403）
- **提出物の引き継ぎ**: 承認前の提出・進捗は user_id ベースのため、承認後もそのまま引き継がれる。管理者/メンテナーのレビュー一覧にはお試しユーザーの提出も表示される

### データモデル (Supabase/PostgreSQL)

論理削除と表示順を備えた3層コンテンツ階層:
- **learning_phases** → **learning_weeks** → **learning_contents**（種別: `video`, `text`, `exercise`。お試し公開フラグ `is_open_to_trial` を持つ）
- **user_progress**: コンテンツごとの完了状態を記録（user+contentでユニーク）
- **submissions**: 演習コンテンツに紐づくコードまたはURLの提出物。コード提出は単一/複数ファイルに対応する。単一ファイルは `code_content`（TEXT）に保存し、複数ファイル（例: `コード.gs` + `index.html`）は `code_files`（JSONB: `[{filename, language, content}]`）に保存する。どちらか一方のみが値を持ち、もう一方は `NULL`（後方互換: 既存の `code_content` のみの提出はそのまま有効）。表示・AIレビューでは `getSubmissionCodeFiles()`（`app/lib/submission-files.ts`）でファイル配列に正規化して扱う。

スライドPDFは Supabase Storage の `slides` バケット内に、オブジェクトキー **`<コーススラッグ>/slide-NN.pdf`**（NNは最低2桁のゼロ埋め）で保存する（例: キー `gas-advanced/slide-03.pdf` → 公開URL `.../storage/v1/object/public/slides/gas-advanced/slide-03.pdf`）。アップロードAPI（`app/api/upload-pdf/route.ts`）はフォルダ指定＋連番（自動採番／番号指定）に対応しており、シードSQL（`supabase/migrations/03_seed/`）もこのパスを前提とする。

セキュリティはデータベースレベルの**Row Level Security (RLS)** ポリシーで実現。`get_user_status()` ヘルパー関数でリクエストユーザーのステータスを参照し、公開コンテンツは `active` ユーザーが閲覧可能、お試しユーザー（`status='pending'`）は `is_open_to_trial=true` かつ `is_published=true` のコンテンツのみ SELECT 可（アプリ層のチェックと合わせた二層防御、InitPlan最適化パターンを維持）。進捗・提出物は本人のみで、INSERT には可視コンテンツ限定の EXISTS 条件を課す。管理者は全データの読み書きが可能。

### サービス層 (`app/services/`)

- `api/` — Supabaseクライアント生成、学習コンテンツ・進捗・提出物・ユーザー・管理者向けのデータアクセス関数
- `auth/` — サーバーサイド認証ヘルパーとロールベースの権限チェック

### 主要パターン

- **Server Componentsがデフォルト**: ページとレイアウトは非同期Server ComponentとしてSupabaseを直接呼び出す
- **Client Components**: 必要な場合のみ `"use client"` を付与（インタラクティブなフォーム、ボタン等）
- **コンテンツ描画**: Markdownはサニタイズ処理を経て表示、動画はYouTube埋め込み
- **パスエイリアス**: `@/*` がプロジェクトルートにマッピング

### 環境変数

`.env.local` に設定が必要（`.env.local.example` 参照）:
- `NEXT_PUBLIC_SUPABASE_URL` — SupabaseプロジェクトURL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase Publishableキー
- `SUPABASE_SERVICE_ROLE_KEY` — Service Roleキー（管理操作用）
- `SUPABASE_PROJECT_ID` — Supabase CLI操作用
- `GEMINI_API_KEY` — Gemini API（AIレビュー機能用）

### データベースマイグレーション

SQLマイグレーションは `supabase/migrations/` に連番のSQLファイルで管理。
