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
│   ├── upgrade/         # Stripeサブスク決済でのアップグレード画面（success/ に決済完了画面）
│   └── page.tsx         # 進捗概要付きダッシュボード
├── api/
│   ├── admin/users/     # PATCH: ユーザー承認・却下
│   ├── manage/          # テーマ・フェーズ・週・コンテンツのCRUD
│   ├── ai-review/       # POST: 提出物のAIレビュー
│   ├── upload-pdf/      # POST: スライドPDFのアップロード
│   ├── progress/        # POST: コンテンツごとの進捗をupsert
│   ├── submissions/     # POST: コードまたはURLの提出物を作成
│   └── stripe/          # checkout/portal/webhook: サブスク決済（後述）
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

### 会員種別（membership_type）

承認済みユーザーは「**コミュニティ会員**（`community`）」と「**一般有料会員**（`general`）」に分類する。前者はコミュニティ会員プラン、後者は本サービスのみを利用するプランを指す。ロール（権限）とは独立した軸で、**現時点では種別によるコンテンツ・機能のアクセス差はない**（将来の出し分けに備えた区別のみ）。一般有料会員はStripeサブスク決済による自動昇格に対応する（後述）。**コミュニティ会員は決済連携の対象外**で、入金確認等は引き続き手動運用とする。

- **カラム**: `users.membership_type`（`VARCHAR(20) CHECK (membership_type IN ('community', 'general'))`）。承認前（`pending`）・却下（`rejected`）は `NULL`。CHECK制約はNULLを許容するため `NOT NULL` は付けない
- **設定タイミング**: 管理者が `/admin/users` の承認操作で種別を選択し、`status=active` と同時に設定する（`approveUser(userId, membershipType)`）。却下時（`rejectUser()`）は `NULL` に戻す。却下ボタンは `active` ユーザーにも出るため、種別が設定済みの場合は確認ダイアログで解除される旨を明示する。承認済みユーザーの種別変更UIは未実装（#95）
- **API**: `PATCH /api/admin/users` の `approve` アクションは `membershipType`（`community` / `general`）が必須。未指定・不正値は400
- **型・定数**: `MembershipType`（`app/types`）、`USER_MEMBERSHIP` / `USER_MEMBERSHIP_LABELS` / `MEMBERSHIP_TYPES`（`app/constants/user.ts`）。**許可値の列挙は `MEMBERSHIP_TYPES` に一本化**し、APIのバリデーションと承認UIの `<option>` 生成の双方をここから導出する（リテラルを各所にハードコードしない）
- **`active` と種別の整合性**: CHECK制約は値の妥当性のみを検証し「`status=active` なら `membership_type` は NOT NULL」までは**DBでは保証していない**。この不変条件は `approveUser()` / `rejectUser()` を経由するアプリ層でのみ担保される
- **既存データ**: マイグレーション適用時に既存の `active` ユーザーを一括で `community` にバックフィルする

### お試し（trial）ユーザー

承認前ユーザー（`status=pending`）を「**お試し（trial）ユーザー**」と呼ぶ。お試し体験を通じた入会動機の醸成のため、承認前でも通常ログインでき、**お試し公開**指定されたコンテンツのみ閲覧・課題提出できる（DBの status 値 `'pending'` 自体のリネームは #88 で対応予定。新設フラグ名・UI文言には trial 系の名称を用いる）。

- **お試し公開フラグ**: `learning_contents.is_open_to_trial`（`BOOLEAN NOT NULL DEFAULT false`）。コンテンツ編集フォーム（`/manage/contents`、admin/maintainer のみ）のチェックボックス「お試しユーザーにも公開する」で設定する
- **閲覧範囲**: お試しユーザーは `is_open_to_trial=true` かつ `is_published=true` のコンテンツのみ閲覧・進捗登録・提出が可能
- **ロック表示**: コースツリー（テーマ/フェーズ/週/コンテンツ一覧）は全件表示しつつ、お試し非公開のコンテンツは鍵アイコンでロックし中身は見せない。直リンク時もロック画面を表示する
- **RLS強化の対象範囲**: ステータスによる絞り込みを追加するのは `learning_contents` のみ。親階層（`learning_themes`/`learning_phases`/`learning_weeks`）は従来どおりステータス不問で `is_published=true` を閲覧可のため変更しない。したがって通常クライアントで取得できなくなるのは**お試し非公開コンテンツの行のみ**であり、service_role の適用範囲もそこに限定される
- **service_role によるコンテンツ情報の取得**: 上記により、**受講生向けのコンテンツ配信経路で RLS をバイパスしてよいのは以下の2箇所のみ**（管理者・講師向けの権限チェック済みクエリや、`user_id` フィルタで担保している既存の service_role 利用は対象外・従来どおり）
  - ツリー表示の一覧サマリー取得（ロック済みコンテンツのタイトル・並び順の表示用）
  - **コンテンツ詳細ページの存在チェック**（直リンク時に「存在しない（404）」と「ロックされている」を区別するため。通常クライアントでは両者とも0行になり判別できない）。ロック済みと判定した場合はタイトルのみ表示するロック画面を返し、本文・動画・スライドは一切取得しない
  - いずれも **`is_published = true AND is_deleted = false` で必ず絞り**（service_role はRLSを素通りするため、条件を省くと未公開コンテンツのタイトルが露出する）、カラム許可リスト（`id, title, content_type, display_order, is_open_to_trial, week_id` のみ。`week_id` は週ごとのグルーピング・存在チェックに使用。本文カラムは select しない）を用いる。0行なら404扱いとする
- **APIのお試し公開チェック**: 提出API（`/api/submissions`）・進捗API（`/api/progress`）では、`rejected` を403としたうえで、**ステータスを問わず対象コンテンツが自分に可視でなければ403**とする。判定は通常クライアントで `contentId` を SELECT し0行なら403（RLSがステータスを織り込むため、アプリ層でのステータス分岐は不要。存在しないIDも同時に弾ける）
- **ダッシュボード進捗率の分母**: お試しユーザーの進捗率は**お試し公開コンテンツのみを分母**とする（体験範囲内の進捗を示す）。ダッシュボードの集計（`fetchThemeProgressSummaries`）は通常クライアントのネスト select のため、RLSによる絞り込みがそのまま分母に反映され、追加実装は不要。ツリーは全件表示・進捗率はお試し公開分の分母、という差異は意図的なもの
- **提出物の引き継ぎ**: 承認前の提出・進捗は user_id ベースのため、承認後もそのまま引き継がれる。管理者/メンテナーのレビュー一覧にはお試しユーザーの提出も表示される
- **既知の制約（スライドPDF）**: スライドは公開バケット（`slides`、`public=true`）配信でオブジェクトキーが連番のため、ロック済みコンテンツのPDFもURL推測で取得できる。これは本機能以前からの既存の性質であり、署名付きURL化は別issue（#89）で対応する

### Stripeサブスク決済（月額課金）

お試しユーザーが `/upgrade` からStripe Checkout（ホスト型）で月額サブスクリプションを契約すると、決済完了と同時に**管理者承認なし**で一般有料会員（`status=active` / `membership_type=general`）へ自動昇格する。**コミュニティ会員はスコープ外**（従来どおり管理者の手動承認のみ）。カード情報は一切扱わず、Checkout・Customer Portal（お支払い管理・解約）ともStripeのホスト型UIに任せる。

- **決済日の固定**: 決済日（請求サイクルのアンカー）は登録日ベースにせず、全ユーザー一律で**毎月27日 UTC 0:00（＝JST 9:00）**に固定する（`app/constants/stripe.ts` の `BILLING_ANCHOR_DAY_OF_MONTH` / `BILLING_ANCHOR_HOUR_UTC`。リテラルを各所にハードコードせずこの定数を参照する）。`createCheckoutSession()` が `subscription_data.billing_cycle_anchor_config`（`day_of_month`/`hour`/`minute`/`second` を明示指定）で設定し、月の長さ・うるう年の考慮はStripe側に委ねる。`billing_cycle_anchor_config` は**サブスク作成時にのみ**適用されるため既存契約者への遡及適用はできず（アンカー移行はスコープ外）、本番での実課金開始前に導入することが前提
  - 初回請求は日割り（`proration_behavior: "create_prorations"`）とする。無償（`"none"`）にすると「27日直前に登録して1ヶ月弱を無償利用して解約する」抜け道ができるため。ただしアンカー直前の登録では日割り額がStripeの最低請求額（JPY ¥50）を下回りCheckout作成・決済が失敗しうるため、`isProrationBelowMinimum()`（`app/services/api/stripe-server.ts`）で判定し、下回る場合に限り `proration_behavior` を `"none"` に切り替える（無償になるのは長くても数時間分のため全面 `"none"` とは規模が異なり抜け道にはならない）。判定はPriceの `unit_amount`（`fetchSubscriptionPrice()` と共有するモジュールスコープのTTLキャッシュ）と、次回・前回アンカー時刻から算出した経過比率で行う
  - `/upgrade`（お試しユーザー向け特典リスト）・`/upgrade/success`（決済完了画面）に、毎月27日が決済日であること・初回のみ日割りとなることを明示する。課金条件の説明であるため実装（アンカー日・日割り設定）とのズレは事故に直結する
- **データモデル**: 専用テーブル `stripe_subscriptions`（ユーザーごとの課金状態のミラー、`user_id UNIQUE` で1ユーザー1行固定・DELETEせず常にupsert）と `stripe_events`（Webhook冪等性用、`event.id` がPK）を追加。**アプリの認可は従来どおり `users.status`/`membership_type` が唯一の真実**で、`users` にStripe関連カラムは足さない
  - `stripe_subscriptions` の行は解約後も残り続けるため、「現在契約中か」の判定は行の有無だけでなく `status` が終端状態（`TERMINAL_SUBSCRIPTION_STATUSES` = `canceled`/`unpaid`/`incomplete_expired`/`paused`、`app/services/api/stripe-server.ts`）でないことも確認する
- **会員化のタイミング**: Webhook（`checkout.session.completed`）を正とし、`activateUserFromCheckoutSession()`（`app/services/api/stripe-webhook-server.ts`）が冪等に `stripe_subscriptions` upsert + `users` 更新を行う。`/upgrade/success` ページのサーバー側でも同一の冪等関数を呼ぶため、Webhookの配信遅延に関係なく決済直後から利用できる
  - `users` の昇格（`status=active`/`membership_type=general`）は、Stripeから取得し直した最新のサブスク状態が `ACTIVATABLE_SUBSCRIPTION_STATUSES`（= `active`/`trialing`、`app/services/api/stripe-server.ts`）のときのみ行う。`payment_status==='paid'` だけを見ないのは、Checkout Sessionは決済後もStripe側に不変オブジェクトとして残るため、解約後に `/upgrade/success?session_id=...` を再訪しただけで無償のまま再昇格できてしまう経路を防ぐため。却下（`rejected`）済みユーザーも昇格対象から除外する（`.neq("status", "rejected")`）
  - `trialing` を昇格対象に含めているため、Price側でトライアル期間を設定し支払い方法未登録のままトライアルが終了すると、Stripeはサブスクを `paused` に遷移させる。これを終端状態（`TERMINAL_SUBSCRIPTION_STATUSES`）に含めていないと、一度も支払わずに `active`/`general` のまま無期限で留まってしまうため、`paused` も終端状態に含めている
  - `/upgrade/success` の決済確認は `payment_status==='paid'` だけでなく `no_payment_required`（トライアル契約でCheckout時点の決済が発生しない場合）も許容する（`PAID_CHECKOUT_PAYMENT_STATUSES`）。Webhook側は`trialing`を昇格対象に含めているのに対し、successページだけ`paid`限定にすると、トライアル契約時にWebhook経由では昇格しているのにsuccessページでは「決済情報を確認できませんでした」という誤ったエラー表示になる非対称が生じるため
  - Checkoutの決済手段は `payment_method_types: ["card"]` でカードのみに限定する。コンビニ払い等の遅延通知系決済手段は `checkout.session.completed` 発火時点で未入金（`incomplete`）になり得るため、決済手段をカードに絞ることで、この設計が前提とする「Checkoutから戻った瞬間に必ず利用開始できる」を成立させている
  - `stripe_subscriptions` のミラーupsertは、既に**別の**現行契約（終端状態でない行）が記録済みの場合はスキップする（`activateUserFromCheckoutSession()`）。古い成功ページURLのリプレイで現行契約のミラーが上書きされ、以後の解約Webhookが `stripe_subscription_id` で照合できなくなる事故を防ぐ
  - `activateUserFromCheckoutSession()` は実際に昇格したかを `activated: boolean` で返す。`/upgrade/success` はこれを見て成功表示の可否を分岐する（昇格しなかった場合に誤って完了表示を出さないため）
  - `stripe.subscriptions.retrieve()` によるライブ状態の取得は、既存行チェックの後・ミラーupsertの直前の1箇所だけで行い、その結果をミラーupsertとusers更新の両方に使う（取得から書き込みまでの間隔を最小化するため）。それでもミラーupsert〜users更新の間に解約Webhookが並行実行される競合は理論上残る（完全な排他制御にはDBトランザクション/RPCが必要でスコープ外）
- **降格のタイミング**: `status` が終端状態（`TERMINAL_SUBSCRIPTION_STATUSES` = `canceled`/`unpaid`/`incomplete_expired`/`paused`）へ遷移した場合に `revertUserToTrial()` で `status=pending`/`membership_type=NULL` へ戻す。**`membership_type='general'` の行のみ**をUPDATE条件に含めるガードをSQLレベルで持ち、コミュニティ会員・手動承認済みユーザーを誤って巻き込まない。初回の支払い失敗（`past_due`）では降格せず、Stripe Smart Retriesに任せてSlack通知のみ行う（`sendSlackPaymentFailedNotification()`）
  - **既知の限界**: このガードは「`membership_type` が現在generalか」しか見ておらず、Stripe経由で契約したユーザーと管理者が手動で`general`承認したユーザーを区別できない。却下 → 管理者が手動でgeneral再承認 → 旧契約の遅延Webhookが届く、という順序が発生すると手動承認分が誤って降格されうる（会員化の由来を永続化する設計変更が必要。会員種別変更UIの#95と合わせて要検討）
- **Webhook処理**（`app/api/stripe/webhook/route.ts`）: 生ボディ（`request.text()`）のまま署名検証（`stripe.webhooks.constructEvent()`）してから処理する。`syncSubscriptionStatus()` はWebhookイベントに埋め込まれたsubscriptionスナップショットを信用せず、`stripe.subscriptions.retrieve()` でStripe APIから最新状態を取り直してから書き込む（Webhookは到着順が保証されないため、古いイベントが遅延して届いてもミラーが巻き戻らないようにするため）
  - イベント冪等性は `stripe_events.id`（PK）への素のINSERTを「claim」として使う原子的排他制御（`claimEvent()`）。同一event.idの並行配信はDBの一意制約により片方だけがclaimに成功する。ハンドラが失敗した場合のみ `releaseEventClaim()` でclaimを削除し、Stripeの自動リトライが再度claimできるようにする（先に成功扱いで記録するとハンドラ失敗時にリトライが永久にスキップされるため、claim＝処理権の確保とrelease＝失敗時の解放を明確に分離している）。`releaseEventClaim()` はcatchブロック内でも例外から保護して呼ぶ（`safeReleaseEventClaim()`）
  - サーバーレス関数の異常終了等で`releaseEventClaim()`へ到達できずclaimが残り続けるケースの救済として、claimが`EVENT_CLAIM_TTL_MINUTES`（10分、`app/services/api/stripe-webhook-server.ts`）を超えて放置されている場合のみ再claimを許可する。ハンドラは冪等なため、まれに完了済みイベントを再claim・再実行しても実害は小さい（Slack通知の重複程度）
  - `releaseEventClaim()` のDELETE条件には `id` に加えて `processed_at` の一致も含める。TTL経過後に別プロセスが再claimした直後、旧claim保持者が遅れて解放処理に到達すると、無条件DELETEでは新しいclaimまで消してしまい3重処理の窓が開くため（`claimEvent()` は自分が確保・更新した `processed_at` を返し、そのまま `releaseEventClaim()` に渡す）
- **APIルート**: `POST /api/stripe/checkout`（`getServerAuth()`でお試しユーザーのみ許可、既存の有効なサブスク行があれば409）、`POST /api/stripe/webhook`（署名検証必須）、`POST /api/stripe/portal`（自身の `stripe_subscriptions` 行が無ければ404）。checkout/portalは自分の行を読むSELECTのみのため `assertServiceRoleConfigured()` は呼ばない。DB書き込みを行うのはWebhookハンドラ（`app/services/api/stripe-webhook-server.ts` の各関数）のみで、いずれも冒頭で `assertServiceRoleConfigured()` により `SUPABASE_SERVICE_ROLE_KEY` の設定を明示的に検証してから `createAdminSupabaseClient()` を使う
  - `/api/stripe/checkout` は、解約済み等で終端状態の既存 `stripe_subscriptions` 行がある場合、その `stripe_customer_id` を `createCheckoutSession()` に渡して再利用する。渡さないと再契約のたびに新規Stripe Customerが作られ、旧Customerが保存済みカード・請求履歴ごと孤児化しCustomer Portalからも参照できなくなるため。渡した `stripe_customer_id` がStripe側で見つからない（`resource_missing`）場合は、`createCheckoutSession()` が新規Customerでの作成にフォールバックする。フォールバックしないと、ダッシュボードでの削除等が起きた場合に当該ユーザーが恒久的にCheckoutへ進めなくなるため
- **RLS**: `stripe_subscriptions` はSELECTのみ「本人 or admin」。書き込みポリシーは作らず、service_role経由（Webhook・successページ）に限定する。`stripe_events` はポリシーなし（service_role専用）
- **フェイルクローズ**: `/upgrade` ページ・`/admin/users` ページはいずれもStripe契約状況の取得エラーを握り潰さず、専用のエラーメッセージを表示する。特に管理画面では、取得エラー時にサブスク契約中バッジ・却下時の手動キャンセル警告が消えると却下操作でStripe課金だけが継続する事故につながるため、取得失敗時は却下確認ダイアログに「契約状況を判定できない」旨の警告を必ず含める
- **管理画面**: `/admin/users` に「現在契約中とみなせる」サブスク会員バッジを表示し、契約中ユーザーを却下する際は「Stripeダッシュボードでの手動キャンセルが別途必要」の警告を出す（自動キャンセル連携はスコープ外）。終端状態の除外はSQL側（`.not("status", "in", ...)`）で行い、JS側でのフィルタは行わない
- **`/upgrade` の月額料金表示**: `fetchSubscriptionPrice()` はStripe Priceの `unit_amount`（JPYゼロdecimal通貨前提）をモジュールスコープのTTLキャッシュ（5分）付きで取得する。このキャッシュは `isProrationBelowMinimum()` とも共有する（Priceはほぼ不変のため、ページ表示・Checkout作成のたびにStripe APIを呼ぶのを避ける）。契約中ユーザー向けの次回更新日・解約予定日は `stripe_subscriptions.current_period_end` をそのまま表示する。`/upgrade/success` の決済完了画面でも同カラムから次回のお支払い予定日を表示する

### データモデル (Supabase/PostgreSQL)

論理削除と表示順を備えた4層コンテンツ階層:
- **learning_themes** → **learning_phases** → **learning_weeks** → **learning_contents**（種別: `video`, `text`, `exercise`。お試し公開フラグ `is_open_to_trial` を持つ）
- **user_progress**: コンテンツごとの完了状態を記録（user+contentでユニーク）
- **submissions**: 演習コンテンツに紐づくコードまたはURLの提出物。コード提出は単一/複数ファイルに対応する。単一ファイルは `code_content`（TEXT）に保存し、複数ファイル（例: `コード.gs` + `index.html`）は `code_files`（JSONB: `[{filename, language, content}]`）に保存する。どちらか一方のみが値を持ち、もう一方は `NULL`（後方互換: 既存の `code_content` のみの提出はそのまま有効）。表示・AIレビューでは `getSubmissionCodeFiles()`（`app/lib/submission-files.ts`）でファイル配列に正規化して扱う。

スライドPDFは Supabase Storage の `slides` バケット内に、オブジェクトキー **`<コーススラッグ>/slide-NN.pdf`**（NNは最低2桁のゼロ埋め）で保存する（例: キー `gas-advanced/slide-03.pdf` → 公開URL `.../storage/v1/object/public/slides/gas-advanced/slide-03.pdf`）。アップロードAPI（`app/api/upload-pdf/route.ts`）はフォルダ指定＋連番（自動採番／番号指定）に対応しており、シードSQL（`supabase/migrations/03_seed/`）もこのパスを前提とする。

セキュリティはデータベースレベルの**Row Level Security (RLS)** ポリシーで実現。親階層（themes/phases/weeks）の公開コンテンツは認証済み全ユーザーが閲覧可能、`learning_contents` は `active` ユーザーが公開分を閲覧可能・お試しユーザー（`status='pending'`）は `is_open_to_trial=true` かつ `is_published=true` の行のみ SELECT 可（アプリ層のチェックと合わせた二層防御）。進捗・提出物は本人のみ、管理者は全データの読み書きが可能。

**RLSヘルパー関数**: ロール・ID・ステータスの参照は `get_user_role()` / `get_user_id()` / `get_user_status()` を用いる。いずれも `users` 自身のRLSとの無限再帰を防ぐため `SECURITY DEFINER` + `SET search_path = public` + `STABLE` で定義し、anon からの REST RPC 経由の実行を防ぐため `PUBLIC, anon` から EXECUTE を REVOKE、`authenticated, service_role` へ GRANT する。ポリシー内では `(select get_user_xxx())` の形で包み、行ごとの再評価を防いでInitPlan化させる（`auth_rls_initplan` 対策）。同一操作の許可ポリシーはロール別に分けず OR 条件で1本に統合する（`multiple_permissive_policies` 対策）。

**進捗・提出物の書き込み制限**: `user_progress` / `submissions` の INSERT に加えて、`user_progress` の **UPDATE にも可視コンテンツ限定の EXISTS 条件を課す**。進捗APIは upsert（`onConflict: user_id,content_id`）で、既存行がある場合は UPDATE 経路を通るため、INSERT のみに条件を課すと2回目以降の更新がすり抜けるため。これにより、お試し公開フラグを後から `false` に戻したコンテンツの進捗も書き換えられなくなる。この条件はステータスを問わず適用されるため、`active` ユーザーも不可視コンテンツ（未公開・存在しないID）へは書き込めなくなる（通常のUI経路では到達しないため正常系への影響はない）。

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
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` — Stripeサブスク決済用
- `NEXT_PUBLIC_APP_URL` — Checkout/Portalのリダイレクト先URL生成に使用

### データベースマイグレーション

SQLマイグレーションは `supabase/migrations/` に連番のSQLファイルで管理。`01_schema/`（テーブル・カラム・ヘルパー関数）→ `02_rls/`（RLSポリシー）→ `03_seed/`（初期データ）の順に適用する。RLSポリシーが参照するカラムやヘルパー関数は、先に `01_schema/` 側で追加されている必要がある。
