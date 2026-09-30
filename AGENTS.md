# AGENTS.md

AIコーディングエージェント向けのガイダンス（[agents.md](https://agents.md/) 規約）。Claude Code 固有の設定は `CLAUDE.md` に置く。

## このファイルの編集方針

**本ファイルは毎リクエスト全文が読み込まれる。** 追記前に確認：

- **載せるのは「知らないと壊すこと」だけ**（コマンド・運用・コードスタイル・**不変条件**）。構成・責務・仕様は `README.md` / `docs/` の担当。
- 設計判断の結論と理由は `docs/` に、経緯・調査ログ・一時的な手順は git / PR / Issue 履歴に置く（#185）。
- **特定の関数・分岐の落とし穴は、まずコード内コメントに書く。** `docs/` と同じ内容を二重に持たず、あるなら参照へ置き換える。
- 節を増やさず既存の節に一行足せないか先に検討する。停止中・未使用の機能は「無効であること」と参照先だけ残す。
- **`AGENTS.md` と `CLAUDE.md` の合計で 200行 / 12,000文字以内。** 超えたら `docs/` へ移す。ツール固有の設定は `CLAUDE.md` 等へ。

詳細は `docs/requirements.md`（要件）/ `docs/specification.md`（機能設計）/ `docs/database.md`（DB・RLS設計）/ `docs/testing.md`（テスト）/ `README.md`（セットアップ・環境変数・構成）にある。要約を書かない。

## コマンド・運用

Next.js 16 App Router + Supabase。パッケージマネージャは **bun**（npm/yarn/pnpm 不可）。スクリプトは README。

- **push 前・作業完了前には必ず `bun run test:all` を通す。**
- DBスキーマ変更後は `bun run db:types` を実行し、生成物もコミットする。
- **`main` へ直接コミット・push せず、作業ブランチ（`feature/` `bug/` `docs/` `refactor/` `env/` 等）を切り PR 経由でマージする。**
- PR は `.github/pull_request_template.md` に従う。

## コードスタイル (Biome)

- ダブルクォート、セミコロン必須、ES5トレイリングカンマ、2スペース、行幅100文字（詳細は `biome.json`）
- `useConst`・`useImportType`/`useExportType` は error。型のみのインポートは `import type`
- コードのコメントは英語で「why」（理由・壊すと起きること）だけ。言い換え（what）・変更履歴・ファイルヘッダ概要は書かない。コメントのみの変更は `bun run check:comments` でロジック不変を確認する。

## 実装時に必ず守ること

構成は `README.md`、責務は `docs/specification.md` 1.2節。以下は不変条件のみ。

### 認証・認可

全体像・ロール（`admin` / `maintainer` / `member`）・ステータス（`active` / `trial` / `rejected`）は `docs/specification.md` 2章。

- **サーバー側のユーザー情報取得は `getServerAuth()`（`app/services/auth/server-auth.ts`）に一本化する。** layout・page・API Route のいずれも他の手段を使わない（`docs/specification.md` 2.2）。
- **認可は二層防御。** `proxy.ts`（Middleware の後継）が第一の砦、`app/(authenticated)/layout.tsx` でも `userStatus` の許可リスト検証を行う。**クライアント側の認証ガードは行わない。**
- **プロキシはフェイルクローズ。** 環境変数欠落・例外・status null はすべて `/login` へ。
- **Cron ルート（`app/api/cron/`）は `isAuthorizedCronRequest()`（`app/services/auth/cron-auth.ts`）による `CRON_SECRET` の検証を必ず通す**（未設定・不一致は 401）。`/api` は proxy の対象外のため、ルート側の検証だけが防御になる。
- **定期メールの送る日・曜日・上限は `email_kind_settings` / `email_settings` が唯一の真実。定数をハードコードしない**（`docs/specification.md` 10.10）。
- **メール文面は `email_templates` → コードの既定値の順で解決し、差し込む値は Markdown 変換の後に入れ HTML ではエスケープする**（`docs/specification.md` 10.11）。
- ロール判定ロジックは `app/services/auth/` に集約する。
- **初回登録の INSERT は同意 Cookie 必須。** 同意なしでは `users` 行を作らず `/login?error=terms_required` へ戻す。`terms_accepted_at` は callback でのみ書き、既存ユーザー分岐では触らない。

### 会員種別・お試しユーザー

仕様は `docs/specification.md`（2.6・2.7）と `docs/database.md` を参照。

- **許可値の列挙は `MEMBERSHIP_TYPES`（`app/constants/user.ts`）に一本化する。** APIのバリデーションも承認UIも、`'community'` / `'general'` をハードコードしない。
- **`status=active` と `membership_type` の整合性はDBでは保証されない。** `approveUser()` / `rejectUser()` を迂回して `status` を書き換えない。
- **受講生向け配信経路で service_role を使ってよいのは2箇所だけ**（ツリー表示の一覧サマリー取得と、コンテンツ詳細の存在チェック）。いずれも **`is_published = true AND is_deleted = false` で必ず絞り**、カラム許可リスト（`id, title, content_type, display_order, is_open_to_trial, week_id`）のみを select し、0行なら404。管理者向けクエリ等は対象外。admin / maintainer 向け未公開プレビュー（2.12節）はこの2箇所を増やさず、通常クライアント（RLS適用）で取得する。定期メールの抽出（`email-digest-server.ts`）も service_role の別経路で、同じ絞り込みと本文を含まないカラムだけを守る（お知らせ一斉送信の `announcements.body` 読取は例外）。未認証の `/demo`（`demo-learning-server.ts`）は service_role 専用の別経路で、スライドの署名付きURLは **`is_published = true AND is_open_to_trial = true` に限って**発行する。
- **`learning-server.ts` の取得関数は `userRole` を受け取り、admin / maintainer のみ `is_published` 絞り込みを外す**（2.12節）。member / お試しでは常に維持する。
- **提出API・進捗APIの可視性チェックは通常クライアントの SELECT で行う。** `contentId` を `is_published = true` 付きで SELECT し0行なら403。ステータス分岐はRLSが担う（2.12節）。

### Stripeサブスク決済（月額課金）

**仕様は `docs/specification.md` 2.11節。決済まわりを触る前に必ず読むこと。**

- 有効・無効は `STRIPE_ENABLED`。判定は `isStripeEnabled()`（`app/constants/stripe.ts`）に集約し、`"true"` 以外はフェイルクローズで無効。決済系の追加時は無効時の経路も用意する。
- 認可は `users.status` / `membership_type` が唯一の真実。`users` にStripe関連カラムは足さず、課金状態は `stripe_subscriptions` のミラーで持つ。
- **Checkout は「処理権の確保 → Customer の確保 → Stripe 呼び出し」の順を崩さない。** `claimCheckoutSlot()` / `releaseCheckoutSlot()` と `ensureCheckoutCustomer()` の迂回は二重契約・二重課金と解約不能な契約を招く。契約の有無は `NON_CURRENT_SUBSCRIPTION_STATUSES` で判定する（`database.md` 3.9）。
- **`/upgrade` の法定表示と Checkout 可否は連動させる。** 実請求額を確認できないときは画面の Checkout を無効化し `POST /api/stripe/checkout` も 503。判定は `isChargeableSubscriptionPrice()`、料金は `DISPLAY_MONTHLY_PRICE_JPY`、決済日は `BILLING_ANCHOR_DAY_OF_MONTH` を使い、リテラルをハードコードしない。

### データモデル・Storage・RLS

設計意図・不変条件は `docs/database.md`、定義の正は `supabase/migrations/` と `app/types/lib/database.types.ts`。

- **submissions** は `code_content`（単一）と `code_files`（JSONB・複数）の**どちらか一方のみが値を持つ**。表示・AIレビューは必ず `getSubmissionCodeFiles()`（`app/lib/submission-files.ts`）で正規化し、両カラムを直接分岐しない。
- **Storage のキー規約**（変更するとシードSQLとアップロードAPIが揃って壊れる）
  - `slides`（**非公開**）: `<コーススラッグ>/slide-NN.pdf`（NNは最低2桁のゼロ埋め）。`learning_contents.pdf_url` には**このキーのみ**を保存し（URLは保存しない）、配信は権限チェック後に `createSlideSignedUrl()`（`app/services/api/slides-server.ts`）が署名付きURLを発行する。キー以外は閲覧不能になる（`docs/specification.md` 3.2節・`docs/database.md` 6.8節）。
  - `thumbnails`（公開）: `theme-{themeId}/thumbnail.{png|jpg|webp}`。`image_url` は相対パス保存で、表示時に `resolveStorageUrl()` でURLを前置する。
- ロール・ID・ステータスの参照は `get_user_role()` / `get_user_id()` / `get_user_status()` を用いる（定義・権限・`rejected` で NULL を返す挙動は `docs/database.md` 5.2節）。
- ポリシー内では **`(select get_user_xxx())` の形で包み**（`auth_rls_initplan` 対策）、同一操作の許可ポリシーは **OR 条件で1本に統合する**（`multiple_permissive_policies` 対策）。
- `user_progress` は INSERT だけでなく **UPDATE にも可視コンテンツ限定の EXISTS 条件を課す**（upsert のため INSERT のみだと2回目以降がすり抜ける）。

### データベースマイグレーション

`supabase/migrations/` **直下にフラットな SQL で管理する（サブディレクトリ禁止。CLI が再帰走査しないため #149）**。ファイル名は `<14桁タイムスタンプ>_<説明>.sql`。**タイムスタンプはリモート適用履歴と比較されるため、既存ファイルのリネームは必ず `supabase migration list` で対応を確認してから行う**。RLSは参照先カラム・関数を追加した migration より後にする。

追加後の確認は `docs/database.md` 7.1節。**破壊的変更（カラム削除・リネーム・型変更、既存行を書き換えるデータ移行、Storageバケット・ポリシーの変更）は、本番反映前に Wiki の [本番環境リリース手順](https://github.com/Singuralitylabs/sinlab-study/wiki/本番環境リリース手順)に従う。**

### 環境変数・AIレビュー

`.env.local` に設定する。**名前・用途の正式な一覧は `README.md`。** キー振り分けは `resolveGeminiApiKey()`（`app/services/api/gemini.ts`）、モデル名・上限値等は `app/constants/gemini.ts` に集約する。**キーはサーバー側でのみ扱い、レスポンス・ログへ出さない**（`docs/specification.md` 6.1.2節）。
