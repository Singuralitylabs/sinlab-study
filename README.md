# Sinlab Study - Web技術学習支援サービス

「AIと学ぶ実践Web技術講座」の学習フェーズを支援するWebアプリケーション。
受講生向けの学習コンテンツ配信・進捗管理・課題提出・AIレビュー機能と、運営向けの管理機能を提供する。

## 主な機能

- **学習コンテンツ配信** — Theme > Phase > Week > コンテンツの4階層構造で、動画・テキスト・演習・スライドを配信
- **進捗管理** — コンテンツ単位の完了トグルと、ダッシュボードでの進捗率表示
- **課題提出** — コード貼り付けまたはURL共有による演習課題の提出
- **AIレビュー** — 提出コードに対してGemini APIによる自動レビューを実施
- **管理機能** — コンテンツCRUD（テーマ管理含む）、受講生進捗一覧、提出管理、統計ダッシュボード

## 技術スタック

| 項目 | 技術 |
|:--|:--|
| フレームワーク | Next.js 16 (App Router) |
| UI | React 19 / Tailwind CSS 4 / Shadcn/UI |
| 言語 | TypeScript 5 |
| ランタイム | Bun |
| バックエンド / DB / 認証 | Supabase (PostgreSQL + Auth + RLS + Storage) |
| AI | Google Gemini API (@google/genai) |
| コードエディタ | CodeMirror 6 |
| コード品質 | Biome |
| ホスティング | Vercel |

## セットアップ

### 前提条件

- [Bun](https://bun.sh/) がインストール済みであること（バージョンは下記「Bun のインストール手順」を参照）
- Supabase プロジェクトが作成済みであること

### Bun のインストール手順

Bun は **`1.3.8`** に固定している（`.bun-version` と `package.json` の `packageManager`。CI も `.bun-version` を参照）。[公式ドキュメント](https://bun.sh/docs/installation) に従って導入し、`bun --version` で確認する。[mise](https://mise.jdx.dev/) なら `mise settings add idiomatic_version_file_enable_tools bun` を一度実行すると `mise install` で自動導入される。

> バージョンを上げるときは `.bun-version` / `package.json` の `packageManager` / この節を**同時に**更新する（ずれると CI とローカルの環境差異が再発する）。

### 環境変数

`.env.local` を作成し、以下の環境変数を設定する（`.env.local.example` 参照）。

```
NEXT_PUBLIC_SUPABASE_URL=<Supabase プロジェクトURL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase Publishable Key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase Service Role Key>
SUPABASE_PROJECT_ID=<Supabase プロジェクトID>
GEMINI_API_KEY=<Gemini API Key（会員用・有料ティア。AIレビュー機能）>
GEMINI_API_KEY_TRIAL=<任意。お試しユーザー用・無料ティア。未設定時は GEMINI_API_KEY にフォールバック>
SLACK_NOTIFICATION_WEBHOOK_URL=<任意。初回ログイン承認依頼・Stripe支払い失敗のSlack通知。未設定時は通知をスキップ>
RESEND_API_KEY=<任意。受講生向けメール通知（Resend）の API キー。未設定時はメール送信をスキップ>
EMAIL_FROM_ADDRESS=<任意。メールの送信元（返信不可の noreply@...。開発時は onboarding@resend.dev）。未設定時はメール送信をスキップ>
CRON_SECRET=<任意。定期メールの Cron ルートの認証（Vercel Cron が Bearer で送る）。未設定時は Cron ルートが常に 401>
EMAIL_UNSUBSCRIBE_SECRET=<任意。案内メールの配信停止リンクの署名鍵。未設定時は定期メールを送らない。変更すると送信済みのリンクが無効になる>
STRIPE_ENABLED=<Stripe決済機能の有効化フラグ。"true" 以外はフェイルクローズで無効>
STRIPE_SECRET_KEY=<Stripe Secret Key>
STRIPE_WEBHOOK_SECRET=<Stripe Webhook 署名シークレット>
STRIPE_PRICE_ID=<月額サブスクリプションの Price ID>
NEXT_PUBLIC_APP_URL=<Checkout/Portal のリダイレクト先URL・メール本文のリンク生成に使用>
```

一覧の正本はこの節と `.env.local.example`。本番リリース時の確認は Wiki の [本番環境リリース手順](https://github.com/Singuralitylabs/sinlab-study/wiki/本番環境リリース手順) Step 5 を参照。

### インストール・起動

**既にマイグレーション適用履歴があるプロジェクトに接続する場合は、`db push` の前に `supabase migration list` でローカルとリモートの履歴が一致していることを確認すること**（未整合だと既存オブジェクトの作成でエラーになる。対処は Issue #185 のコメント、本番適用は Wiki の[本番環境リリース手順](https://github.com/Singuralitylabs/sinlab-study/wiki/本番環境リリース手順)を参照）。マイグレーションの配置規約は `AGENTS.md` を参照。

```bash
# 依存関係のインストール
bun install

# データベースマイグレーション（Supabase CLIを使用。既存環境は上記の注意を参照）
bunx supabase db push

# 開発サーバー起動
bun dev
```

`http://localhost:3000` でアクセス可能。

### 主要なスクリプト

| コマンド | 説明 |
|:--|:--|
| `bun dev` | 開発サーバー起動（Turbopack） |
| `bun run build` | プロダクションビルド |
| `bun start` | プロダクションサーバー起動 |
| `bun run lint` | Biome によるリント |
| `bun run format` | Biome によるフォーマット |
| `bun run check` | Biome によるリント + フォーマット |
| `bun run db:types` | Supabase から TypeScript 型定義を生成（`.env.local` があれば読み込み、なければ環境変数 `SUPABASE_PROJECT_ID` を使用） |
| `bun run test` | Vitest によるユニットテスト実行 |
| `bun run check:comments [基準ref]` | 変更した TS/JS がコメント・整形のみの差分か（AST同一・`@ts-*`/`biome-ignore` の増減なし）を検証。未追跡ファイルも対象、コード以外の変更ファイルは「未検証」として一覧表示。差異・パース失敗があれば該当ファイルを列挙して非ゼロ終了（既定の基準は `origin/main`） |
| `bun run test:all` | build/db:types/lint/format/check/test を一括実行 |

### Claude Code から Supabase MCP を使う

Claude Code で Supabase MCP サーバーを使う場合、**必ず read-only モードで登録する**。`execute_sql` はこのモードだと読み取り専用の Postgres ユーザーで実行され、書き込みが DB 側で拒否される。

- リモート（推奨）: `https://mcp.supabase.com/mcp?project_ref=<SUPABASE_PROJECT_ID>&read_only=true`
- ローカル（npm）: `npx -y @supabase/mcp-server-supabase@latest --project-ref=<SUPABASE_PROJECT_ID> --read-only`

詳細は [Supabase MCP Server](https://supabase.com/docs/guides/ai-tools/mcp) を参照。サーバーの登録名は任意（`.claude/settings.json` のフックはどの名前でも `execute_sql` に反応する）。

`.claude/settings.json` の PreToolUse フック（`.claude/hooks/allow-readonly-sql.mjs`）は、読み取り専用（SELECT 等）と判定できた `execute_sql` の許可確認をスキップする**利便性のための仕組み**で、書き込み防止の実体ではない（副作用のある関数を呼ぶ SELECT は通る）。read-only モードを省略せず、`execute_sql` を `permissions.allow` に登録しないこと（`CLAUDE.md`「自動実行の許可」参照）。

## 定期メール（Vercel Cron）の運用

`vercel.json` の `crons` で、毎日 UTC 23 時台（JST 8 時台）に `GET /api/cron/email-digest` を呼び、週次進捗・未学習リマインド・お試しユーザー向け案内を送る（仕様は `docs/specification.md` 10.7〜10.9節）。Cron は Production デプロイでのみ動き、Preview・ローカルでは動かないため、動作確認は `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/email-digest` で手動実行する。本番で有効にするのは、利用規約の改定（案内メールの送信に関する条項）後に Vercel へ `CRON_SECRET` / `EMAIL_UNSUBSCRIBE_SECRET` を設定してから。

## Dependabot PR のマージ運用

[Dependabot](./.github/dependabot.yml) が週次（Bun）・月次（GitHub Actions）で更新 PR を作成する。マイナー・パッチはグループ集約、メジャーは個別 PR。担当は [@yamashin01](https://github.com/yamashin01)（週次確認）。

- マイナー・パッチのグループ PR は、CI（Biome / 型チェック / ユニットテスト / ビルド）が通れば そのままマージしてよい。
- メジャー更新は Breaking Changes（特に `next` はリリースノート）を確認してからマージする。

## プロジェクト構成

```
app/
├── (authenticated)/     # 認証必須のページ群
│   ├── admin/           #   管理者専用画面（/admin/users・/admin/emails・/admin/emails/templates のみ。他は /manage にリダイレクト）
│   ├── manage/          #   コンテンツ管理画面（admin + maintainer 共通）
│   ├── instructor/      #   講師向け画面（/manage にリダイレクト）
│   ├── learn/           #   学習コンテンツ画面（Theme > Phase > Week > Content の4階層）
│   ├── submissions/     #   提出履歴画面
│   ├── components/      #   認証済みレイアウト用コンポーネント
│   └── page.tsx         #   ダッシュボード
├── api/                 # API Routes
│   ├── admin/users/     #   ユーザー承認・却下・ロール変更・配信停止の管理
│   ├── admin/email-settings/ #   メール通知の設定（admin のみ）
│   ├── admin/email-templates/ #   メール文面・サービス名の編集、プレビュー、テスト送信（admin のみ）
│   ├── admin/email-logs/ #   メール送信履歴（admin のみ）
│   ├── ai-review/       #   AIレビュー（Gemini API）
│   ├── manage/          #   コンテンツ管理（phases/weeks/contents/themes）
│   ├── onboarding/      #   初回利用ガイドの完了記録
│   ├── progress/        #   進捗更新
│   ├── submissions/     #   課題提出
│   └── upload-pdf/      #   PDFスライドアップロード（Supabase Storage）
├── components/          # 共通UIコンポーネント
├── constants/           # 定数定義
├── providers/           # React Context Providers
├── services/            # サービスレイヤー
│   ├── api/             #   Supabase クエリ・Gemini APIクライアント
│   └── auth/            #   認証・権限チェック
└── types/               # TypeScript 型定義
supabase/
└── migrations/          # DBマイグレーションSQL
proxy.ts                 # 認証プロキシ（Next.js 16 の Middleware 後継）
docs/                    # 設計ドキュメント
```

## ドキュメント

| ドキュメント | 内容 |
|:--|:--|
| [要件定義書](./docs/requirements.md) | プロジェクト概要、機能要件、非機能要件、画面一覧 |
| [データベース設計書](./docs/database.md) | DB・RLS の設計意図・不変条件（定義の正は `supabase/migrations/` と `app/types/lib/database.types.ts`） |
| [機能設計書](./docs/specification.md) | アーキテクチャ、認証・認可、API 仕様、画面設計、コンポーネント設計 |
| [テスト設計書](./docs/testing.md) | テスト方針、テスト対象と観点、CI / ツール構成、テスト規約 |
