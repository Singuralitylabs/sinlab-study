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
├── (auth)/              # 公開ページ（認証不要。ルートグループのためURLは /login・/rejected）
│   ├── login/           # Googleログインページ
│   └── rejected/        # 却下画面
├── auth/callback/       # OAuthコールバック（セッション確立 + ユーザー自動登録）: /auth/callback
├── (authenticated)/     # 全ページで有効なユーザーセッションが必要（active / pending のみ）
│   ├── admin/           # 管理者専用：ユーザー承認・却下（users/ のみ実体。他は /manage/* への旧パスリダイレクト）
│   ├── manage/          # admin・maintainer：テーマ・フェーズ・週・コンテンツ・受講生・提出物管理
│   ├── instructor/      # /manage への旧パスリダイレクト
│   ├── learn/           # 学習画面: [themeId]/[phaseId]/[weekId]/[contentId]
│   ├── submissions/     # 受講生の提出履歴
│   └── page.tsx         # 進捗概要付きダッシュボード
├── api/
│   ├── admin/users/     # PATCH: ユーザー承認・却下
│   ├── manage/          # テーマ・フェーズ・週・コンテンツのCRUD
│   ├── ai-review/       # POST: 提出物のAIレビュー
│   ├── upload-pdf/      # POST: スライドPDFのアップロード
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
**サーバー側のユーザー情報取得**: layout・page・API Routeでは `getServerAuth()`（`app/services/auth/server-auth.ts`）に一本化する。`React.cache()` によりリクエスト単位でメモ化されるため、layoutとpageの双方から呼んでも認証確認・`users` テーブル照会は1リクエストにつき1回しか実行されない。API Route はステータス（`active`/`pending`/`rejected`）に基づく認可判定が必要なため、`userId`/`authId` しか返さない旧 `getApiAuth()` は使用せず、`getServerAuth()` へ移行する（#80 を #86 に包含。`rejected` は API では 403 を返す）。

**ロール**: `admin`（全権限）、`maintainer`（コンテンツ管理）、`member`（受講生）
**権限チェック**: `app/services/auth/` にロールベースの権限チェックロジックを集約

### お試し（trial）ユーザー

承認前ユーザー（`status=pending`）を「**お試し（trial）ユーザー**」と呼ぶ。お試し体験を通じた入会動機の醸成のため、承認前でも通常ログインでき、**お試し公開**指定されたコンテンツのみ閲覧・課題提出できる（DBの status 値 `'pending'` 自体のリネームは #88 で対応予定。新設フラグ名・UI文言には trial 系の名称を用いる）。

- **お試し公開フラグ**: `learning_contents.is_open_to_trial`（`BOOLEAN NOT NULL DEFAULT false`）。コンテンツ編集フォーム（`/manage/contents`、admin/maintainer のみ）のチェックボックス「お試しユーザーにも公開する」で設定する
- **閲覧範囲**: お試しユーザーは `is_open_to_trial=true` かつ `is_published=true` のコンテンツのみ閲覧・進捗登録・提出が可能
- **ロック表示**: コースツリー（テーマ/フェーズ/週/コンテンツ一覧）は全件表示しつつ、お試し非公開のコンテンツは鍵アイコンでロックし中身は見せない。直リンク時もロック画面を表示する
- **RLS強化の対象範囲**: ステータスによる絞り込みを追加するのは `learning_contents` のみ。親階層（`learning_themes`/`learning_phases`/`learning_weeks`）は従来どおりステータス不問で `is_published=true` を閲覧可のため変更しない。したがって通常クライアントで取得できなくなるのは**お試し非公開コンテンツの行のみ**であり、service_role の適用範囲もそこに限定される
- **service_role によるコンテンツ情報の取得**: 上記により、**受講生向けのコンテンツ配信経路で RLS をバイパスしてよいのは以下の2箇所のみ**（管理者・講師向けの権限チェック済みクエリや、`user_id` フィルタで担保している既存の service_role 利用は対象外・従来どおり）
  - ツリー表示の一覧サマリー取得（ロック済みコンテンツのタイトル・並び順の表示用）
  - **コンテンツ詳細ページの存在チェック**（直リンク時に「存在しない（404）」と「ロックされている」を区別するため。通常クライアントでは両者とも0行になり判別できない）。ロック済みと判定した場合はタイトルのみ表示するロック画面を返し、本文・動画・スライドは一切取得しない
  - いずれも **`is_published = true AND is_deleted = false` で必ず絞り**（service_role はRLSを素通りするため、条件を省くと未公開コンテンツのタイトルが露出する）、カラム許可リスト（`id, title, content_type, display_order, is_open_to_trial` のみ。本文カラムは select しない）を用いる。0行なら404扱いとする
- **APIのお試し公開チェック**: 提出API（`/api/submissions`）・進捗API（`/api/progress`）では、`rejected` を403としたうえで、**ステータスを問わず対象コンテンツが自分に可視でなければ403**とする。判定は通常クライアントで `contentId` を SELECT し0行なら403（RLSがステータスを織り込むため、アプリ層でのステータス分岐は不要。存在しないIDも同時に弾ける）
- **ダッシュボード進捗率の分母**: お試しユーザーの進捗率は**お試し公開コンテンツのみを分母**とする（体験範囲内の進捗を示す）。ダッシュボードの集計（`fetchThemeProgressSummaries`）は通常クライアントのネスト select のため、RLSによる絞り込みがそのまま分母に反映され、追加実装は不要。ツリーは全件表示・進捗率はお試し公開分の分母、という差異は意図的なもの
- **提出物の引き継ぎ**: 承認前の提出・進捗は user_id ベースのため、承認後もそのまま引き継がれる。管理者/メンテナーのレビュー一覧にはお試しユーザーの提出も表示される
- **既知の制約（スライドPDF）**: スライドは公開バケット（`slides`、`public=true`）配信でオブジェクトキーが連番のため、ロック済みコンテンツのPDFもURL推測で取得できる。これは本機能以前からの既存の性質であり、署名付きURL化は別issue（#89）で対応する

### データモデル (Supabase/PostgreSQL)

論理削除と表示順を備えた4層コンテンツ階層:
- **learning_themes** → **learning_phases** → **learning_weeks** → **learning_contents**（種別: `video`, `text`, `exercise`。お試し公開フラグ `is_open_to_trial` を持つ）
- **user_progress**: コンテンツごとの完了状態を記録（user+contentでユニーク）
- **submissions**: 演習コンテンツに紐づくコードまたはURLの提出物。コード提出は単一/複数ファイルに対応する。単一ファイルは `code_content`（TEXT）に保存し、複数ファイル（例: `コード.gs` + `index.html`）は `code_files`（JSONB: `[{filename, language, content}]`）に保存する。どちらか一方のみが値を持ち、もう一方は `NULL`（後方互換: 既存の `code_content` のみの提出はそのまま有効）。表示・AIレビューでは `getSubmissionCodeFiles()`（`app/lib/submission-files.ts`）でファイル配列に正規化して扱う。
- **ai_reviews**: Gemini によるAIレビュー結果と、1リクエストごとの `prompt_tokens` / `completion_tokens` を保存する
- **ai_token_monthly_usages**: AIレビューの月次累計トークン数、通知済み状態、管理画面表示用の集計値を保持する予定の集計テーブル（後続実装で追加予定）

スライドPDFは Supabase Storage の `slides` バケット内に、オブジェクトキー **`<コーススラッグ>/slide-NN.pdf`**（NNは最低2桁のゼロ埋め）で保存する（例: キー `gas-advanced/slide-03.pdf` → 公開URL `.../storage/v1/object/public/slides/gas-advanced/slide-03.pdf`）。アップロードAPI（`app/api/upload-pdf/route.ts`）はフォルダ指定＋連番（自動採番／番号指定）に対応しており、シードSQL（`supabase/migrations/03_seed/`）もこのパスを前提とする。

セキュリティはデータベースレベルの**Row Level Security (RLS)** ポリシーで実現。親階層（themes/phases/weeks）の公開コンテンツは認証済み全ユーザーが閲覧可能、`learning_contents` は `active` ユーザーが公開分を閲覧可能・お試しユーザー（`status='pending'`）は `is_open_to_trial=true` かつ `is_published=true` の行のみ SELECT 可（アプリ層のチェックと合わせた二層防御）。進捗・提出物は本人のみ、管理者は全データの読み書きが可能。

**RLSヘルパー関数**: ロール・ID・ステータスの参照は `get_user_role()` / `get_user_id()` / `get_user_status()` を用いる。いずれも `users` 自身のRLSとの無限再帰を防ぐため `SECURITY DEFINER` + `SET search_path = public` + `STABLE` で定義し、anon からの REST RPC 経由の実行を防ぐため `PUBLIC, anon` から EXECUTE を REVOKE、`authenticated, service_role` へ GRANT する。ポリシー内では `(select get_user_xxx())` の形で包み、行ごとの再評価を防いでInitPlan化させる（`auth_rls_initplan` 対策）。同一操作の許可ポリシーはロール別に分けず OR 条件で1本に統合する（`multiple_permissive_policies` 対策）。

**進捗・提出物の書き込み制限**: `user_progress` / `submissions` の INSERT に加えて、`user_progress` の **UPDATE にも可視コンテンツ限定の EXISTS 条件を課す**。進捗APIは upsert（`onConflict: user_id,content_id`）で、既存行がある場合は UPDATE 経路を通るため、INSERT のみに条件を課すと2回目以降の更新がすり抜けるため。これにより、お試し公開フラグを後から `false` に戻したコンテンツの進捗も書き換えられなくなる。この条件はステータスを問わず適用されるため、`active` ユーザーも不可視コンテンツ（未公開・存在しないID）へは書き込めなくなる（通常のUI経路では到達しないため正常系への影響はない）。

### サービス層 (`app/services/`)

- `api/` — Supabaseクライアント生成、学習コンテンツ・進捗・提出物・ユーザー・管理者向けのデータアクセス関数
- `auth/` — サーバーサイド認証ヘルパーとロールベースの権限チェック
- `notifications/` — Slack Incoming Webhooks などの通知連携。ユーザー承認待ち通知とAIトークン使用量アラートで利用する

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
- `AI_REVIEW_MONTHLY_TOKEN_LIMIT` — AIレビューの月次トークン上限
- `AI_REVIEW_MONTHLY_WARNING_THRESHOLD_PERCENT` — 警告通知の閾値（例: 80）
- `SLACK_NOTIFICATION_WEBHOOK_URL` — Slack通知Webhook URL（承認待ち通知・AIトークン使用量アラート共通）

トークン使用量モニタリング関連の項目は設計先行であり、このブランチでは `.env.local.example` にも追記している。実装時はこの設定値を参照して月次上限判定と通知を行う。

### データベースマイグレーション

SQLマイグレーションは `supabase/migrations/` に連番のSQLファイルで管理。`01_schema/`（テーブル・カラム・ヘルパー関数）→ `02_rls/`（RLSポリシー）→ `03_seed/`（初期データ）の順に適用する。RLSポリシーが参照するカラムやヘルパー関数は、先に `01_schema/` 側で追加されている必要がある。
