# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## このファイルの編集方針

**CLAUDE.md は毎リクエストの先頭に全文が読み込まれる。** 記述を増やすことは常時のコンテキスト消費と、本当に守らせたいルールの埋没を同時に招く。追記の前に必ず以下を確認すること。

- **載せるのは「知らないと壊すこと」だけ。** コマンド・運用ルール・コードスタイル、そして**不変条件**（「X は必ず Y を経由する」「Z を使ってよいのはここだけ」）に限る。ディレクトリ構成やレイヤーの責務は `README.md` / `docs/` の担当。
- **「なぜそう設計したか」は載せない。** 経緯・トレードオフ・検討の結果は `docs/` に書き、ここには結論の一行と参照先だけを置く。
- **特定の関数・分岐の落とし穴は、まずコード内コメントに書く。** それを壊しそうな人が最初に目にする場所はソースであり、このファイルではない。
- **`docs/` と同じ内容を二重に持たない。** 追記の前に `docs/` を検索し、あるなら参照へ置き換える。無いなら「まず `docs/` に書く」を検討する。
- **機能追加のたびに節を増やさない。** 既存の節に一行足せないかを先に検討する。新設は、既存のどこにも属さない横断ルールが生まれたときだけ。
- **停止中・未使用の機能の詳細を残さない。** フラグで無効化した機能は「無効であること」と参照先だけを残す。
- **目安として全体 200行 / 12,000文字を超えない。** 超えたら追記ではなく `docs/` への移動を行う。

**詳細な仕様・設計判断はすべて以下にある（このファイルに要約しないこと）。**
`docs/requirements.md`（要件）/ `docs/specification.md`（機能設計）/ `docs/database.md`（DB・RLS設計）/ `docs/testing.md`（テスト方針）/ `README.md`（セットアップ・環境変数）

## プロジェクト概要

「AIと学ぶ実践Web技術講座」の学習コンテンツ配信サービス。Next.js 16 App Router + Supabase で構築し、Google OAuthによるログインとユーザー承認フローを備える。

## 自動実行の許可

`.claude/settings.json`（チーム共有・コミット対象）の `permissions.allow` に登録されたコマンドは、**事前確認を求めず**タスクの一部として即座に実行してよい。**許可範囲を変えるときはこのファイルを編集する**（このファイルの記述を増やしても許可は増えない）。個人用の追加設定は `.claude/settings.local.json`（gitignore済み）に置く。

**allow に入れてよいのは、参照・データ取得系のコマンドとローカルで完結する作業補助のみ。** 外部CLI（`supabase`・`vercel`）はサブコマンド単位で登録し、サーバー側を更新するもの（`supabase db push`、`vercel deploy` 等）は登録しない。`git push` も同様に含めない（「ブランチ運用」のユーザー確認ルールを毎回通すため）。

**Supabase MCP の `execute_sql` は allow に入れない。** 引数で絞れないため、読み取り専用クエリ（SELECT 等）だけを自動許可する PreToolUse フック `.claude/hooks/allow-readonly-sql.mjs` で代替している。書き込みを含むクエリは従来どおり確認を求める。

## コマンド

パッケージマネージャは **bun**（npm/yarn/pnpm は使わない）。スクリプトの一覧は `README.md` を参照。

- **push 前・作業完了前には必ず `bun run test:all` を通す**（build/db:types/lint/format/check/test を一括実行）。CIで落ちてから気づく流れにしない。
- DBのスキーマを変更したら `bun run db:types` で型定義を再生成し、生成物（`app/types/lib/database.types.ts`）もコミットする。

## ブランチ運用

**`main` へ直接コミット・push せず、必ず作業ブランチ（`feature/`・`bug/`・`docs/`・`refactor/`・`env/` などの接頭辞付き）を切り、PR 経由でマージする。**

## プルリクエスト

PRを作成する際は必ず `.github/pull_request_template.md` のテンプレートに従うこと。
`gh pr create` を使用する場合は `--body` に同テンプレートの全セクションを含めること。

## コードスタイル (Biome)

- ダブルクォート、セミコロン必須、ES5トレイリングカンマ
- インデント2スペース、行幅100文字
- `useConst`、`useImportType`/`useExportType` はerrorレベルで強制
- `noUnusedVariables`/`noUnusedImports` はwarnレベル
- 型のみのインポートには `import type` を使用すること

## 実装時に必ず守ること

ディレクトリ構成は `README.md` の「プロジェクト構成」、レイヤーの責務は `docs/specification.md` 1.2節を参照。以下は docs に書かれていない、コードを壊さないための不変条件のみを列挙する。

### 認証・認可

フローの全体像・画面ごとの挙動は `docs/specification.md` 2章を参照。

- **サーバー側のユーザー情報取得は `getServerAuth()`（`app/services/auth/server-auth.ts`）に一本化する。** layout・page・API Route のいずれからも他の手段を使わない（`React.cache()` でメモ化されるため重複呼び出しは無害）。旧 `getApiAuth()` は使用しない。
- **認可は二層防御。** `proxy.ts`（Next.js 16 における Middleware の後継）を第一の砦とし、`app/(authenticated)/layout.tsx` でも `userStatus` の許可リスト検証を行う。**クライアント側での認証ガードは行わない。**
- **プロキシはフェイルクローズ。** 環境変数欠落・例外・ステータス取得不能（null）はすべて `/login` へリダイレクトする。
- **ロール**: `admin`（全権限）/ `maintainer`（コンテンツ管理）/ `member`（受講生）。判定ロジックは `app/services/auth/` に集約する。
- **ステータス**: `active`（承認済み）/ `pending`（お試し。アプリは使えるがお試し公開コンテンツのみ閲覧可）/ `rejected`（`/rejected` へ。APIでは403）。`/pending` 画面は廃止済み。

### 会員種別・お試しユーザー

仕様は `docs/specification.md`（2.6・2.7）と `docs/database.md` を参照。

- **許可値の列挙は `MEMBERSHIP_TYPES`（`app/constants/user.ts`）に一本化する。** APIのバリデーションも承認UIの `<option>` 生成もここから導出し、`'community'` / `'general'` のリテラルをハードコードしない。
- **`status=active` と `membership_type` の整合性はDBでは保証されない**（CHECK制約は値の妥当性のみ）。`approveUser()` / `rejectUser()` を迂回して `status` を書き換えないこと。
- **受講生向け配信経路で service_role を使ってよいのは2箇所だけ**（ツリー表示の一覧サマリー取得と、コンテンツ詳細の存在チェック）。いずれも **`is_published = true AND is_deleted = false` で必ず絞り**、カラム許可リスト（`id, title, content_type, display_order, is_open_to_trial, week_id`）のみを select する。0行なら404扱い。権限チェック済みの管理者向けクエリや `user_id` フィルタで担保している既存利用は対象外。admin / maintainer 向けの未公開プレビュー（`docs/specification.md` 2.12節）はこの2箇所を増やさず、通常クライアント（RLS適用）の別経路で取得する。
- **`learning-server.ts` の取得関数は `userRole` を受け取り、admin / maintainer の場合のみ `is_published` 絞り込みを外す**（RLSは既に許可済み。詳細は `docs/specification.md` 2.12節）。member / お試しユーザー向けの挙動・RLSの適用範囲は変更しない。
- **提出API・進捗APIの可視性チェックは通常クライアントの SELECT で行う。** `contentId` を `is_published = true` 付きで SELECT して0行なら403。RLSがステータスを織り込むため、アプリ層でステータス分岐を書かない（`is_published` の絞り込みのみ明示する。`isContentVisible()`（`learning-server.ts`）の絞り込み条件・意図は `docs/specification.md` 2.12節を参照）。

### Stripeサブスク決済（月額課金）

**仕様は `docs/specification.md` 2.11節にある。決済まわりを触る前に必ず読むこと。**

- 機能全体の有効・無効は環境変数 `STRIPE_ENABLED` で切り替わる。判定は `isStripeEnabled()`（`app/constants/stripe.ts`）に集約し、`"true"` 以外はフェイルクローズで無効。決済系の導線・APIを追加するときは、無効時の経路も必ず用意する。
- アプリの認可は `users.status` / `membership_type` が唯一の真実。`users` にStripe関連カラムは追加せず、課金状態は `stripe_subscriptions` のミラーで保持する。
- **Checkout は「処理権の確保 → Customer の確保 → Stripe 呼び出し」の順を崩さない。** `claimCheckoutSlot()` / `releaseCheckoutSlot()`（`user_id` の UNIQUE 制約による排他）と `ensureCheckoutCustomer()`（ユーザーごとに一意な Customer）を迂回すると、二重契約・二重課金と「Portalから解約できない契約」が再発する。契約の有無の判定は `NON_CURRENT_SUBSCRIPTION_STATUSES` を使う。詳細は `docs/database.md` 3.9。
- **`/upgrade` の法定表示と Checkout 可否は連動させる。** 実請求額を確認できないときは画面の Checkout を無効化し、`POST /api/stripe/checkout` も 503 にする。判定は `isChargeableSubscriptionPrice()`、料金フォールバックは `DISPLAY_MONTHLY_PRICE_JPY`、決済日は `BILLING_ANCHOR_DAY_OF_MONTH` を参照し、リテラルをハードコードしない。詳細は `docs/specification.md` 2.11節。

### データモデル (Supabase/PostgreSQL)

テーブル定義・RLSポリシーの全文は `docs/database.md` を参照。

- 論理削除と表示順を備えた4層階層: **learning_themes** → **learning_phases** → **learning_weeks** → **learning_contents**（種別 `video` / `text` / `exercise`、お試し公開フラグ `is_open_to_trial` を持つ）
- **user_progress**: コンテンツごとの完了状態（user+contentでユニーク）
- **submissions**: 演習に紐づくコードまたはURLの提出物。単一ファイルは `code_content`（TEXT）、複数ファイルは `code_files`（JSONB）に保存し、**どちらか一方のみが値を持つ**。表示・AIレビューでは必ず `getSubmissionCodeFiles()`（`app/lib/submission-files.ts`）で正規化し、両カラムを直接分岐しない。

**Storage のオブジェクトキー規約**（変更するとシードSQLとアップロードAPIが揃って壊れる）

- `slides`（公開）: `<コーススラッグ>/slide-NN.pdf`（NNは最低2桁のゼロ埋め）
- `thumbnails`（公開）: `theme-{themeId}/thumbnail.{png|jpg|webp}`。`learning_themes.image_url` には環境非依存の相対パス `/storage/v1/object/public/thumbnails/...` を保存し、表示時に `resolveStorageUrl()` でSupabase URLを前置する

**RLS**

- ロール・ID・ステータスの参照は `get_user_role()` / `get_user_id()` / `get_user_status()` を用いる。いずれも `SECURITY DEFINER` + `SET search_path = public` + `STABLE` で定義し、`PUBLIC, anon` から EXECUTE を REVOKE、`authenticated, service_role` へ GRANT する。
- `get_user_role()` は却下（`rejected`）ユーザーには NULL を返す（却下してもロール自体はクリアされないため）。詳細は `docs/database.md` 5.2節を参照。
- ポリシー内では **`(select get_user_xxx())` の形で包む**（`auth_rls_initplan` 対策）。同一操作の許可ポリシーはロール別に分けず **OR 条件で1本に統合する**（`multiple_permissive_policies` 対策）。
- `user_progress` は INSERT だけでなく **UPDATE にも可視コンテンツ限定の EXISTS 条件を課す**（進捗APIは upsert のため、INSERT のみだと2回目以降の更新がすり抜ける）。

### データベースマイグレーション

`supabase/migrations/` **直下にフラットなSQLファイルで管理する（サブディレクトリを作らない）**。Supabase CLIの `migration list` / `db push` はサブディレクトリを再帰走査しないため（#149）。ファイル名は `supabase migration new` と同じ `<14桁タイムスタンプ>_<説明>.sql`。**タイムスタンプはリモートの適用履歴と比較される一意なバージョン識別子なので、既存ファイルのリネームは必ず `supabase migration list` で対応関係を確認してから行う**（過去に中身が食い違う事故あり。`docs/database.md` 7.1節）。RLSはより小さいタイムスタンプのファイルで参照先カラム・関数が追加済みであること。

マイグレーション追加後の動作確認・型再生成の手順は `docs/database.md` 7.2節を参照。**破壊的変更（カラム削除・リネーム・型変更）を含む場合は、本番反映前に Wiki の [本番環境リリース手順](https://github.com/Singuralitylabs/sinlab-study/wiki/本番環境リリース手順)に従うこと**（本番反映・ロールバック手順自体はこのリポジトリでは管理しない）。

### 環境変数

`.env.local` に設定する。**用途を含む正式な一覧は `README.md` を参照**（ここでは名前のみ）。

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_PROJECT_ID` / `GEMINI_API_KEY` / `GEMINI_API_KEY_TRIAL` / `STRIPE_ENABLED` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` / `NEXT_PUBLIC_APP_URL`

**AIレビューのキー振り分け**: 選択ロジックは `resolveGeminiApiKey()`（`app/services/api/gemini.ts`）、モデル名・上限値・環境変数名は `app/constants/gemini.ts` に集約する。**キーはサーバー側でのみ扱い、レスポンス・ログへ出さない。** 仕様は `docs/specification.md` 6.1.2節を参照。
