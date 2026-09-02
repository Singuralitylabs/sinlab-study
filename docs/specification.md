# 機能設計書

本書は、Web技術学習支援サービスの各機能の設計について記載する。

---

## 1. システムアーキテクチャ

### 1.1 全体構成

```mermaid
flowchart TB
    subgraph Browser["ブラウザ（クライアント）"]
        SC["Server Components<br/>(SSR / データ取得)"]
        CC["Client Components<br/>(インタラクション)"]
    end
    subgraph Next["Next.js 16 (App Router)"]
        SS["Server Services"]
        API["API Routes"]
        PX["プロキシ proxy.ts<br/>(認証・認可)"]
    end
    subgraph Supabase["Supabase（独自プロジェクト）"]
        PG["PostgreSQL + RLS"]
        AUTH["Auth (Google OAuth)"]
    end
    subgraph External["外部サービス"]
        SL["Slack<br/>(Incoming Webhooks)"]
        GM["Google Gemini API<br/>(AIレビュー)"]
    end

    SC --> SS
    CC --> API
    SS --> PG
    API --> PG
    PX --> AUTH
    SS --> AUTH
    API --> SL
    API --> GM
```

### 1.2 レイヤー構成

| レイヤー | 責務 |
|:--|:--|
| プロキシ（`proxy.ts`） | 認証・認可ゲート（静的ファイル・認証ページ以外の全リクエストをインターセプト） |
| Pages (Server Components) | ページレンダリング・Supabaseからのデータ取得 |
| Client Components | ユーザーインタラクション（フォーム、ボタン等） |
| API Routes | クライアントからのデータ更新（進捗記録、課題提出等） |
| Server Services | Supabase クエリ・ビジネスロジック |
| Auth Services | 認証・ロールベースの権限チェック |
| Notification Services | 外部通知サービスとの連携（Slack Incoming Webhooks） |

---

## 2. 認証・認可機能

### 2.1 プロキシ（proxy.ts）による認証フロー

> Next.js 16 では従来の Middleware が `proxy.ts` に改称された。本サービスの認証フローはこの `proxy.ts`（`proxy()` 関数）で実装している。

```mermaid
flowchart TD
    A[リクエスト受信] --> B{静的ファイル / API / 認証ページ?}
    B -->|はい| P[そのまま通過]
    B -->|いいえ| C{Supabase Auth セッション}
    C -->|未認証| L["/login にリダイレクト"]
    C -->|認証済み| D{ユーザーステータス}
    D -->|取得失敗| L
    D -->|rejected| RE["/rejected にリダイレクト"]
    D -->|pending| OK
    D -->|active| OK[アクセス許可]
```

ステータス取得失敗（null）時は `/login` へ送るフェイルクローズとする。お試しユーザー（`pending`）はページアクセス自体は許可し、コンテンツ単位の制限はアプリ層とRLSで担保する（2.6参照）。

### 2.2 認証の多層構造

| レイヤー | 保護対象 | 方式 |
|:--|:--|:--|
| プロキシ（`proxy.ts`） | 全ページ | Supabase Auth セッション + ユーザーステータス確認（第一の砦。`active` / `pending` のみ許可するフェイルクローズ方式） |
| Server Components（`(authenticated)/layout.tsx`） | 認証必須ページ全体 | `getServerAuth()` の `userStatus` を許可リスト検証（`active` / `pending` 以外はリダイレクト。プロキシのスキップ経路・設定不備に備えた第二の砦） |
| Server Components（layout / page） | ロール別の表示・ナビゲーション | `getServerAuth()`（`React.cache()` でリクエスト単位にメモ化）によるロール取得・権限チェック |
| Server Components（コンテンツ表示） | お試しユーザーへのコンテンツ制限 | `userStatus` と `is_open_to_trial` によるロック判定（RLSと合わせた二層防御の第一層） |
| RLS | データベース | `auth.uid()` によるRow Level Security。お試しユーザーには `learning_contents` をお試し公開分のみに制限（二層防御の第二層） |
| API Routes | データ更新操作 | サーバー側での認証チェック + ステータスに基づく認可（`rejected` は403、お試しユーザーはお試し公開コンテンツのみ書き込み可） |

### 2.3 権限チェック

| 権限レベル | 対象ロール | 用途 |
|:--|:--|:--|
| 管理者権限 | `admin` のみ | 管理ダッシュボード、受講生管理、ユーザー管理 |
| コンテンツ管理権限 | `admin` または `maintainer` | コンテンツ CRUD 操作 |

**会員種別（`membership_type`）**: 承認済みユーザーは「コミュニティ会員（`community`）」と「一般有料会員（`general`）」に分類する。コミュニティ会員はコミュニティ会員プラン、一般有料会員は本サービスのみを利用するプランを指す。ロール（権限）とは独立した軸であり、**現時点では種別によるコンテンツ・機能のアクセス差はない**（将来の出し分けに備えた区別のみ）。承認前（`pending`）・却下（`rejected`）ユーザーは `NULL`。

一般有料会員への昇格には2通りの経路がある。

- **Stripe決済による自動昇格**（`general` のみ）: お試しユーザーが `/upgrade` からStripe Checkoutで決済を完了すると、管理者の承認なしに自動で `status=active` / `membership_type=general` となる（2.11節参照）
- **管理者による手動承認**（`community` / `general` いずれも可）: `/admin/users` の承認操作で管理者が種別を選択して設定する（2.7節）。**コミュニティ会員はStripe決済連携の対象外**であり、従来どおり手動承認のみで入会する

いずれの経路でも入金確認等の決済連携が必要なのは一般有料会員のみで、コミュニティ会員側は引き続き決済連携はスコープ外・手動運用とする。

### 2.4 Googleログインフロー

```mermaid
sequenceDiagram
    actor U as ユーザー
    participant App as 学習支援サービス
    participant G as Google OAuth
    participant SB as Supabase Auth

    U->>App: 1. /login にアクセス
    U->>App: 2. 「Googleでログイン」クリック
    App->>SB: 3. OAuth開始
    SB-->>U: 4. Google認証画面へリダイレクト
    U->>G: 5. Googleで認証
    G->>SB: 6. 認証code返却
    U->>App: 7. /auth/callback
    App->>SB: 8. セッション確立
    App->>App: 9. ユーザー初回判定
    App-->>U: 10. リダイレクト（却下済: /rejected、それ以外: /）
```

**OAuthコールバック処理**:
```mermaid
flowchart TD
    A["GET /auth/callback?code=xxx"] --> B{code あり?}
    B -->|なし| L["/login にリダイレクト"]
    B -->|あり| C{セッション確立}
    C -->|失敗| L
    C -->|成功| D{users テーブル確認}
    D -->|レコードなし| R["自動登録 (pending)"]
    R -->|成功| H
    R -->|失敗| F["/login?error=registration_failed"]
    D -->|論理削除済み| F
    D -->|pending| H
    D -->|rejected| RE["/rejected"]
    D -->|active| H["/ (ダッシュボード)"]
```

初回ログイン（自動登録）後もお試しユーザーとしてそのままダッシュボードへ遷移する。承認待ちであることはアプリ内バナーで通知する。自動登録に失敗した場合、および論理削除済みユーザーの再ログイン時は `/login?error=registration_failed` へリダイレクトする（詳細は9.5.1）。

### 2.5 初回ログイン時のユーザー自動登録

OAuthコールバック処理中に初回ログインを検知し、`users` テーブルにレコードを自動作成する。

**自動登録データ**:

| カラム | 値 | 取得元 |
|:--|:--|:--|
| `auth_id` | Supabase Auth UUID | 認証ユーザー情報 |
| `email` | Googleアカウントのメール | 認証ユーザー情報 |
| `display_name` | Google表示名 | ユーザーメタデータ |
| `avatar_url` | Googleアバター画像 | ユーザーメタデータ |
| `role` | `member` | デフォルト値 |
| `status` | `pending` | デフォルト値 |

INSERT 失敗時は `/login?error=registration_failed` へリダイレクトし、Slack通知は送らない。論理削除済み（`is_deleted = true`）の既存レコードを持つユーザーの再ログインでは INSERT を試行せず、同じエラー導線へ流す。存在確認の失敗や service_role 未設定は `error` なしの `/login` へフェイルクローズする。詳細は9.5.1。

### 2.6 お試し（trial）ユーザーへのコンテンツ制限

承認前ユーザー（`status = 'pending'`）を「**お試し（trial）ユーザー**」と呼ぶ。お試し体験を通じた入会動機の醸成のため、承認前でも通常どおりログインでき、お試し公開指定されたコンテンツのみ閲覧・課題提出できる。

> DB上の status 値 `'pending'` 自体のリネームは別issueで対応予定のため、新設するフラグ名・UI文言にのみ trial 系の名称を用いる。

**閲覧範囲**: `is_published = true` かつ `is_open_to_trial = true` のコンテンツのみ閲覧・進捗登録・提出が可能。

**ロック表示**:

| 対象 | 挙動 |
|:--|:--|
| コースツリー（テーマ / フェーズ / 週 / コンテンツ一覧） | 全件表示する（何が学べるかを見せるため） |
| お試し非公開のコンテンツ | 鍵アイコンでロックし、中身（本文・動画・スライド）は表示しない |
| ロック済みコンテンツへの直リンク | ロック画面を表示する（404にはしない） |
| 承認待ちの通知 | アプリ内バナーで通知（`/pending` 承認待ち専用画面は設けない） |

**承認待ちバナーの表示場所**: `(authenticated)/layout.tsx` で `getServerAuth()` の `userStatus` が `pending` の場合にバナーを表示する。認証必須ページ全体で共通表示となり、ページごとの実装は不要。

**`/pending` の廃止方法**: 旧URLのブックマークからの流入に備え、`/pending` は404にせず `/` へリダイレクトする。実装は以下の2点をプロキシ（`proxy.ts`）で行い、リダイレクト判定を1箇所に集約する。

1. `shouldSkipMiddleware()` の対象から `/pending` を外す（対象に残したままだとプロキシが判定せず素通りさせ、ページ削除後は404になる）
2. ステータス判定を通過した `active` / `pending` ユーザーについて、パスが `/pending` の場合は `/` へリダイレクトする

これにより `rejected` は既存のステータス判定で `/rejected` へ、ステータス取得不能時は `/login` へ送られ、旧URLでも各ステータスの行き先が通常パスと一致する。承認待ち画面（`app/(auth)/pending/`）自体は削除する。

**二層防御**: アプリ層（Server Componentsでの `userStatus` と `is_open_to_trial` によるロック判定・API のお試し公開チェック）とRLS（`learning_contents` のSELECT制限）の二層で担保する。

**service_role クライアントの使用範囲**:

RLS強化により、お試し非公開コンテンツはタイトルを含めて通常クライアント（`authenticated`）から取得できなくなる。ロック表示に必要な最小限の情報を得るため、**受講生向けのコンテンツ配信経路において RLS をバイパスしてよいのは以下の2箇所に限る**。

| 用途 | 理由 |
|:--|:--|
| ツリー表示の一覧サマリー取得 | ロック済みコンテンツのタイトル・並び順を表示するため |
| コンテンツ詳細ページの存在チェック | 直リンク時に「存在しない（404）」と「ロックされている」を区別するため。通常クライアントでは両者とも0行になり判別できない |

> この制限は受講生向けのコンテンツ配信経路に限った話であり、管理者 / 講師向けの権限チェック済みクエリ（`admin-server.ts`・`/api/admin/users`・`/api/upload-pdf`・AIレビュー等）や、`user_id` フィルタで安全性を担保している既存の service_role 利用（`submissions-server.ts` 等）は従来どおりで、本設計の対象外。

**service_role クエリの必須条件**:

service_role は RLS を素通りするため、上記2箇所のクエリには以下を必ず課す。条件を省くと、`active` ユーザーにすら見えない未公開コンテンツのタイトルがお試しユーザーに露出する。

| 項目 | 内容 |
|:--|:--|
| WHERE 条件 | **`is_published = true AND is_deleted = false` で必ず絞る**（RLSが効かないため、通常の公開制御をアプリ側で再現する） |
| カラム許可リスト | `id, title, content_type, display_order, is_open_to_trial, week_id` のみ。`week_id` は週ごとのグルーピングおよびコンテンツ詳細ページの所属週判定に使用する。本文カラム（`text_content` / `video_url` / `pdf_url` / `exercise_instructions` / `reference_answer` / `hint`）は select しない |
| 0行だった場合 | 未公開・論理削除済み・存在しないコンテンツのいずれかであり、**404 として扱う**（ロック画面は表示しない） |

ロック済み（`is_open_to_trial = false`）と判定した場合はタイトルのみ表示するロック画面を返し、本文・動画・スライドは一切取得しない。

**RLS強化の対象範囲**: ステータスによる絞り込みを追加するのは `learning_contents` のみ。親階層（`learning_themes` / `learning_phases` / `learning_weeks`）は従来どおりステータス不問で公開分を閲覧可のため変更しない（データベース設計書の6.1参照）。

**進捗率の分母**: ダッシュボードの進捗率は、お試しユーザーではお試し公開コンテンツのみを分母とする（体験範囲内の進捗を示す）。集計は通常クライアントのネスト select で行うため、RLSによる絞り込みがそのまま分母に反映される。ツリーは全件表示・進捗率はお試し公開分の分母、という差異は意図的なもの。

**提出物の引き継ぎ**: 承認前の提出・進捗は `user_id` ベースで記録されるため、承認後（`pending` → `active`）もそのまま引き継がれる。管理者 / メンテナーのレビュー一覧にもお試しユーザーの提出が表示される。

**既知のエッジケース（お試し公開フラグの取り下げ）**: 提出済みコンテンツの `is_open_to_trial` を後から `false` に戻すと、提出履歴画面（提出物とコンテンツを通常クライアントでネスト取得している）でお試しユーザーにはコンテンツのタイトルが取得できず、表示が欠ける。提出レコード自体は残り、承認後は再び表示される。運用上まれなケースのため、タイトル欠落時のフォールバック表示（「非公開のコンテンツ」等）に留める。

**既知の制約（スライドPDF）**: スライドは公開バケット（`slides`、`public = true`）配信でオブジェクトキーが連番のため、ロック済みコンテンツのPDFもURL推測で取得できる。これは本機能以前からの既存の性質であり、署名付きURL化は別issueで対応する。

### 2.7 ユーザー管理（管理者向け）

**パス**: `/admin/users`

**アクセス権限**: `admin` ロールのみ

**機能**:
- 全ユーザー一覧の表示（ステータスでフィルタ可能）
- ユーザーの承認（`pending` → `active`）。承認時に会員種別を選択する
- ユーザーの却下（`pending` → `rejected`）
- ステータス変更のリカバリ（`rejected` → `active`）
- ユーザーのロール変更（`member` / `maintainer` / `admin` を画面上のセレクトボックスで切り替え）

**ロール変更の制約**:
- 管理者（`admin`）のロールは変更不可（セルフロック防止）
- ロール変更は `active` ユーザーのみ対象
- ロール変更後はページを即時リロードして反映

**会員種別の設定**:
- 承認ボタンの隣のセレクトボックスで「コミュニティ会員」「一般有料会員」を選択し、承認と同時に `membership_type` を設定する（既定は「コミュニティ会員」）
- 却下すると `membership_type` は `NULL` に戻る（承認前・却下ユーザーは会員種別を持たない）
- 却下ボタンは `active` ユーザーにも表示されるため、種別が設定済みのユーザーを却下する際は、確認ダイアログに現在の種別と「設定は解除されます」を明示する（誤操作で種別が失われることを防ぐ）
- 承認済みユーザーの種別を後から変更するUIは現時点では持たない（#95）

**表示項目**: 表示名、メールアドレス、ロール（編集可能）、ステータス、会員種別（バッジ。未設定は `-`）、Stripeサブスク契約中バッジ（現在契約中とみなせるステータスの `stripe_subscriptions` 行を持つユーザーのみ表示。2.11参照）、登録日時、操作ボタン

**Stripeサブスク契約中ユーザーの却下**: 却下してもStripe側のサブスクリプションは自動解約されない（自動連携はスコープ外）。却下確認ダイアログに「Stripeダッシュボードでの手動キャンセルが別途必要です」の警告を表示する。手動キャンセル手順は運用者向けドキュメントを参照。

**契約状況の取得に失敗した場合**: 契約中バッジを一律非表示にする（「契約なし」への誤ったフォールバック）と、実際には契約中のユーザーを却下した際に警告が出ずStripe課金が継続してしまう。取得エラー時はページ上部にエラーメッセージを表示し、却下確認ダイアログにも「契約状況を判定できないため、却下前にStripeダッシュボードで確認してください」という警告を全ユーザー分に表示する（フェイルクローズ）。

### 2.8 ログアウト

サイドナビゲーションからSupabase Authのセッションを破棄し、`/login` にリダイレクトする。

### 2.9 OAuthセキュリティ

| 項目 | 対策 |
|:--|:--|
| PKCE | Supabase Auth が自動的にPKCEフローを使用 |
| CSRF保護 | OAuth stateパラメータによるCSRF防止（Supabase管理） |
| セッション管理 | HTTP-only cookieでセッショントークンを管理 |
| トークン更新 | リフレッシュトークンによる自動更新 |
| 却下済みユーザーのアクセス | プロキシ（`proxy.ts`） + `(authenticated)/layout.tsx` + RLSの多重チェック |
| 承認前ユーザーのアクセス範囲 | お試し公開コンテンツのみ。アプリ層のロック判定 + RLS（`learning_contents` のSELECT制限）の二層で担保（2.6参照） |
| ステータス改ざん | `users` テーブルの更新はRLSでadminロールのみに制限 |
| 自動登録の悪用 | Googleアカウントが必要。登録後は `pending`（お試し）となり、お試し公開コンテンツ以外の閲覧には管理者の承認が必須 |

### 2.10 Supabase Auth 設定

**Google OAuthプロバイダー設定**（Supabaseダッシュボード > Authentication > Providers）:
- Google Cloud ConsoleのOAuth 2.0クライアントID / クライアントシークレット
- リダイレクトURI: `https://<supabase-project-id>.supabase.co/auth/v1/callback`

**Google Cloud Console側の設定**:
- 承認済みリダイレクトURI: Supabaseが提供するコールバックURLを追加
- 承認済みJavaScript生成元: 本アプリのドメインを追加

**Supabase Auth URL設定**:

| 設定項目 | 値 |
|:--|:--|
| Site URL | 本アプリのURL（`http://localhost:3000` / 本番URL） |
| Redirect URLs | `http://localhost:3000/auth/callback`, `https://本番ドメイン/auth/callback` |

### 2.11 Stripeサブスク決済によるアップグレード

**機能フラグ（`STRIPE_ENABLED`）**: 本決済機能全体は環境変数 `STRIPE_ENABLED` で有効・無効を切り替える。判定は `isStripeEnabled()`（`app/constants/stripe.ts`）に集約し、未設定または `"true"` 以外の値は無効として扱う（フェイルクローズ）。`app/constants/stripe.ts` はStripe SDKに依存しないため、layout等の非決済系コードからも軽量に参照できる（決済系コードへは `app/services/api/stripe-server.ts` から再exportして提供する）。以降の節は有効時（`STRIPE_ENABLED=true`）の仕様を記述する。

無効時の挙動は以下のとおり。

| 対象 | 挙動 |
|:--|:--|
| `/upgrade` | Checkout導線（お試しユーザー向け）・お支払い管理導線（一般有料会員向け）をいずれも非表示にし、準備中である旨の案内を表示 |
| `/upgrade/success` | 決済確認・会員昇格処理を一切行わず同様の案内を表示。Stripeのホスト型Checkoutセッションは作成から最大24時間有効なため、無効化の直前に開始されたセッションから再訪しても昇格させない |
| トライアルバナー（`(authenticated)/layout.tsx`）／サイドナビ（`(authenticated)/components/SideNav.tsx`） | アップグレードボタン・「プラン・お支払い」項目を非表示 |
| `POST /api/stripe/{checkout,portal,webhook}` | 認証・署名検証より前段で503を返す（応答メッセージは `STRIPE_DISABLED_MESSAGE` に一元化） |

**対象フロー**: お試しユーザー（`status=pending`）が `/upgrade` からStripe Checkout（ホスト型）で月額サブスクリプションを契約すると、決済完了と同時に**管理者承認なし**で一般有料会員（`status=active` / `membership_type=general`）へ自動昇格する。**コミュニティ会員はスコープ外**で、従来どおり2.7節の手動承認のみを経由する。

**データモデル**: 専用テーブル `stripe_subscriptions`（ユーザーごとの課金状態のミラー、1ユーザー1行）と `stripe_events`（Webhook冪等性用）を用いる。アプリの認可判定は引き続き `users.status` / `users.membership_type` が唯一の真実であり、`users` テーブルにStripe関連カラムは追加しない（詳細は[データベース設計書](./database.md)の3.9/3.10・6.6/6.7を参照）。

**決済日の固定**: 決済日（請求サイクルのアンカー）は登録日ベースではなく、全ユーザー一律で**毎月27日 UTC 0:00（＝JST 9:00）**に固定する（`app/constants/stripe.ts` の `BILLING_ANCHOR_DAY_OF_MONTH` / `BILLING_ANCHOR_HOUR_UTC`）。27日を選んだのは全ての月に存在する日付で短い月の繰り上げ処理が不要なため、UTC 0:00（JST 9:00）を選んだのは決済失敗の検知・対応がしやすい日中帯のためである。実装は `createCheckoutSession()` で `subscription_data.billing_cycle_anchor_config`（`day_of_month`/`hour`/`minute`/`second` を明示）を指定する方式で、月の長さ・うるう年の考慮をStripe側に委ねる。`billing_cycle_anchor_config` はCheckoutセッション作成時にのみ適用されるため、既存契約者への遡及適用（アンカー移行）は行わない（スコープ外）。

初回請求は日割り（`proration_behavior: "create_prorations"`）とする。無償（`"none"`）にすると「27日直前に登録して1ヶ月弱を無償で使い切って解約する」抜け道ができるため。ただし、アンカー直前の登録では日割り額がStripeの最低請求額（JPY ¥50）を下回りCheckout作成・決済が失敗しうるため、`isProrationBelowMinimum()` で判定し、下回る場合に限り `proration_behavior` を `"none"` に切り替える。無償化されるウィンドウの長さは月額に反比例する（月額¥3000なら約12.4時間、月額が低いほど広がる）。最大でも1ヶ月弱を無償利用できる全面 `"none"` 採用時とは規模が異なるため抜け道にはならない、という判断のもとで採用している。判定にはPriceの `unit_amount`（モジュールスコープのTTLキャッシュ、`fetchSubscriptionPrice()` と共有）を用いる。Priceが1ヶ月間隔でない（誤設定）場合は判定できないため `false`（日割りあり）を返す。Price取得自体が一時的に失敗した場合も、Checkout作成全体を失敗させず `create_prorations`（安全側）にフォールバックする。

**Checkout Sessionの有効期限**: `expires_at` はStripe既定の24時間ではなく、常に作成から32分（Stripeが要求する最低30分＋安全マージン2分）に固定する。理由は2つある。

1. 二重Checkoutの排他（後述のclaim）は、セッションを特定できない場合にTTL経過で解除する設計のため。TTL経過時点で古いセッションがまだ決済可能だと、新旧2つのセッションが同時に成立しうる。TTLは「セッション有効期限 + 猶予10分」としてコードで導出し（`CHECKOUT_CLAIM_TTL_MS`）、この不等号を構造的に保証する
2. `proration_behavior: "none"`（アンカー直前の無償化）を選んだ根拠は「アンカーまでの残り時間が短いこと」だが、24時間有効なセッションを無償ウィンドウ内に開いたままアンカー通過後まで決済を遅らせて完了されると、Stripeがサブスク作成時点で次のアンカー（さらに1ヶ月先）を採用し、意図せず約1ヶ月分が無償になりうる（このガードが排除しようとした抜け道の再現）。有効期限が32分なら、アンカーまで32分以上ある間は必ずアンカー前に失効する

アンカーまで32分未満の場合はStripeの最低30分要件によりアンカーを跨ぐ余地が残るが、無償ウィンドウ自体が数時間〜半日程度の中のさらに一部でしかなく実害は小さい（完全に排除するには「アンカー直前は新規Checkout作成を一時停止する」設計が必要でスコープ外）。

**画面構成**:

| 画面 | パス | 内容 |
|:--|:--|:--|
| アップグレード | `/upgrade` | お試しユーザー: 月額料金（Stripe PriceからTTLキャッシュ付きで取得。JPY・1ヶ月間隔で取得できた場合は「月額N円（税込）」を表示。取得失敗時は `DISPLAY_MONTHLY_PRICE_JPY` のフォールバックで法定表示を残す。取得成功だが非月額・非JPYの場合は月額を断定せず見出しを出さない）+ 法定表示5項目（自動更新・料金・支払日/更新日・解約方法と解約後の扱い・未成年者注意文言）+ アップグレードボタン。実請求額を確認できない場合はボタンを無効化する。契約中の一般有料会員: 「ご契約中です」（次回のお支払い日、または解約予定日を`current_period_end`から表示）+ お支払い情報の管理・解約ボタン（Stripe Customer Portalへ遷移）+ 解約後の扱い（日割り返金なし・当該請求期間の末日まで利用可能）。それ以外の `active` ユーザー（コミュニティ会員・手動承認済みの一般有料会員）: 本登録済みの案内のみ。契約状況の取得自体に失敗した場合はエラーメッセージを表示し、契約なし・契約ありのいずれとも誤判定しない（フェイルクローズ）。取得失敗時もお支払い情報の管理・解約ボタンは表示し続けるが、契約の有無が不明なため解約ポリシー文言は出さない（契約が無ければAPI側が404を返すためボタン自体は安全） |
| アップグレード完了 | `/upgrade/success` | Checkoutから戻った直後のページ。`session_id` をStripe APIでretrieveし、決済完了・本人のセッションであることを確認した上で会員昇格を反映し、完了表示する。日割りで少額決済された直後であるため、`activateUserFromCheckoutSession()` が返す次回のお支払い予定日（＝満額請求日、DBの再読み込みなしで返す）も表示する（取得できなくても完了表示自体は行う） |

トライアルバナー（`(authenticated)/layout.tsx`、2.6参照）に `/upgrade` へのCTAボタンを表示する。

**会員化のタイミング（冪等性）**: Webhook（`checkout.session.completed`）を正とし、加えて `/upgrade/success` のサーバー側でも同一の冪等な有効化処理を呼ぶ。Webhookの配信遅延に関係なく、Checkoutから戻った瞬間に一般有料会員として利用開始できる。両者は同じ処理を呼ぶため、実行順序に依存しない。

会員昇格は、Stripeから取得し直した最新のサブスク状態が「現に有効」（`active` / `trialing`）なときのみ行う。Checkoutセッションの `payment_status==='paid'` だけを条件にすると、Checkout Sessionは決済後もStripe側の不変オブジェクトとして残り続けるため、解約後に `/upgrade/success?session_id=...` のURL（ブラウザ履歴等）を再訪しただけで無償のまま再昇格できてしまう。却下（`rejected`）済みユーザーも昇格対象から除外する。`activateUserFromCheckoutSession()` は実際に昇格したかを真偽値で返し、`/upgrade/success` はこれに応じて成功表示の可否を分岐する（昇格しなかった場合に誤って完了表示を出さないため）。

`/upgrade/success` の決済確認は `payment_status==='paid'` に加えて `no_payment_required` も許容する。Price側にトライアル期間が設定されている場合、Checkout時点では決済が発生せず `no_payment_required` になるため、`paid` のみを条件にするとWebhook側（`trialing` を昇格対象に含める）と非対称になり、実際には昇格済みなのにsuccessページで「決済情報を確認できませんでした」という誤ったエラー表示になってしまう。

Checkoutの決済手段はカードのみに限定する（コンビニ払い等の遅延通知系決済手段は使わない）。これらの決済手段では `checkout.session.completed` 発火時点でも未入金（`incomplete`）のままになり得るため、「Checkoutから戻った瞬間に必ず利用開始できる」という設計上の前提を成立させるための制約である。

`stripe_subscriptions` のミラー更新は、既に**別の**現行契約（終端状態でも手続き中でもない行）が記録済みの場合はスキップする。古い成功ページURLのリプレイで現行契約のミラー行が上書きされると、以後の解約Webhookが `stripe_subscription_id` で照合できなくなり、解約しても降格されなくなる事故につながるため。Checkout作成の処理権を確保しただけの行（`checkout_pending`）はまだ契約を表さないため、この判定の対象外とする（対象にすると、いま完了したCheckoutの昇格自体がスキップされてしまう）。ミラー更新時には `checkout_claimed_at` / `checkout_session_id` をNULLに戻し、処理権を正常に解除する。ただし解除するのは、claimが保持しているセッション自身の処理（またはセッションを特定できない場合）に限る。

Stripe APIからのライブ状態取得は、ミラー更新の直前（上記の既存行チェックの後）に1回だけ行い、その結果をミラー更新とusers更新の両方に使うことで、取得時点から書き込み時点までの間隔を最小化している。それでもミラー更新〜users更新の間に解約Webhookが並行実行される競合は理論上残る（完全な排他制御にはDBトランザクション/RPCが必要でスコープ外）。

**降格のタイミング**: サブスクリプションが終端状態（`canceled` / `unpaid` / `incomplete_expired` / `paused`）へ遷移した場合（解約完了・支払いリトライ全滅・未入金のまま期限切れ・トライアル終了後の支払い方法未登録による一時停止）に、お試しユーザーへ自動的に戻す（`status=pending`, `membership_type=NULL`）。降格は **`membership_type=general` のユーザーのみ**が対象で、コミュニティ会員・管理者が手動承認したユーザーを誤って巻き込まない。初回の支払い失敗（`past_due`）では降格せず、Stripe Smart Retriesに任せて運用者へSlack通知のみ行う（9章のSlack通知機能と同じ実装パターン）。進捗・提出データは `user_id` 基準で保持されるため、降格後に再課金しても引き継がれる。

**既知の限界**: この降格ガードは「`membership_type` が現在generalか」しか見ておらず、Stripe経由で契約したユーザーと管理者が手動でgeneral承認したユーザーを区別できない。却下 → 管理者が手動でgeneral再承認 → その間に旧契約の遅延Webhookが届く、という順序が発生すると手動承認分が誤って降格されうる（会員化の由来を永続化する設計変更が必要。会員種別変更UIの#95と合わせて要検討の既知課題）。

**API**:

| エンドポイント | 内容 |
|:--|:--|
| `POST /api/stripe/checkout` | Checkoutセッションを作成しURLを返す。お試しユーザー以外は403。Checkoutセッションを作る前に処理権（claim）を原子的に確保し、確保できない場合（契約中・決済済みで反映待ち）は409を返す（解約済みの行が残っているだけの場合は再契約を許可する）。手続き中のセッションがまだ有効な場合は、新しいセッションを作らず同じURLを返す。Stripe Customerはユーザーごとに一意に確保して再利用し、毎回新規作成しない（旧Customerの孤児化・請求履歴の分裂、およびPortalから解約できない契約を防ぐ）。保存済みCustomerが（ダッシュボードでの削除等により）Stripe側に存在しない場合は、Customerを作り直して保存したうえで1度だけ再試行する（そうしないと当該ユーザーが恒久的にCheckoutへ進めなくなるため）。実額の確認（`fetchSubscriptionPrice()`）は処理権の確保より前に行い、取得失敗・非月額・非JPYのいずれでも503を返す（`/upgrade` の disabled だけでは古いタブや直接POSTを防げないため。Priceの取得はセッションを作らないため、claimの前でも二重作成の防止に影響しない）。処理権を確保した後にCheckoutを作れなかった場合は、必ず解放してから応答する |
| `POST /api/stripe/webhook` | Stripeからのイベントを受信。生ボディで署名検証し、`event.id` のclaim（原子的な処理権確保）に成功した場合のみイベント種別ごとに処理する |
| `POST /api/stripe/portal` | Customer Portalセッションを作成しURLを返す。自身の `stripe_subscriptions` 行がない、またはCustomer未確保（Checkout手続き中に離脱した行のみ）のユーザーは404 |

portal は自分の行を読むSELECTのみだが、checkout は処理権のclaim/releaseで `stripe_subscriptions` を書き込む。DB書き込みを行う関数（Webhookハンドラの各関数と、`claimCheckoutSlot()` / `releaseCheckoutSlot()` / Customer保存）は、いずれも冒頭で `assertServiceRoleConfigured()` により `SUPABASE_SERVICE_ROLE_KEY` の設定を明示的に検証してから `createAdminSupabaseClient()` を使う（未設定時にCookieクライアントへ静かにフォールバックしてRLSに阻まれるのを防ぐ）。Checkoutの決済手段は `payment_method_types: ["card"]` で明示的にカードのみへ限定する。

**エッジケース**:
- 二重Checkout: Checkoutセッションを作る前に `stripe_subscriptions` へ「決済手続き中」行（`status = 'checkout_pending'`）をINSERTして処理権を確保し、`user_id` のUNIQUE制約で排他する（`stripe_events` のclaim/releaseと同じパターン。詳細は[データベース設計書](./database.md)3.9）。決済完了までミラー行が存在しない時間帯を突く並行リクエストも、片方だけがCheckoutセッションを作成できる。Checkout作成に失敗した場合は処理権を解放する
- Stripe Customerの一意性: Customerはユーザーごとに1つだけ確保して保存し、以後は必ず再利用する。Checkoutごとに新規作成されると、ミラー行に載らないCustomerの契約が生まれ `/api/stripe/portal` から解約できなくなるため。作成にはユーザー単位で固定したidempotency keyを用い、保存前にリトライが起きても同じCustomerが返るようにする
- 手続き中に離脱した場合: `checkout_pending` の行は残るが「契約中」とは扱わない（`/upgrade` の契約中表示・管理画面の契約中バッジ・Portalの404判定はいずれも `NON_CURRENT_SUBSCRIPTION_STATUSES` で除外する）。同じユーザーが再度アップグレードを押した場合は、claimが保持するセッション（`checkout_session_id`）の状態で分岐する。`open` なら同じURLへ案内（2つ目のセッションを作らずに再開でき、TTLを待たされない）、`expired` なら処理権を奪って新しいセッションを作成、`complete`（決済済みで反映待ち）なら409。セッションを特定できない場合のみTTL（`CHECKOUT_CLAIM_TTL_MS`）の経過を待つ
- 進行中のCheckoutと古い成功ページURLのリプレイ: 有効なclaimが**別の**セッションを保持している場合、`activateUserFromCheckoutSession()` はミラー更新も処理権の解除も行わない。これを行うと、まだ決済可能なセッションを残したまま次のCheckoutを作れてしまう。加えて、確認から書き込みまでの間に処理権が動いた場合に備え、書き込みは「確認した時点の所有状態」を条件にした条件付きUPDATE（CAS）で行い、0行更新なら読み直して判断からやり直す
- Checkout作成が失敗したか判別できない場合: Stripeが4xxで拒否したときのみ「セッションは作られていない」と確定できるため処理権を解放する。通信タイムアウト・5xxでは解放せず、次回のclaim時にCustomerへ紐づく有効なセッションを照会して再利用するか、TTLの経過に委ねる（未記録の有効なセッションの上に2件目を作らないため）
- Checkout手続き中に管理者が手動承認した場合: 決済完了時点で一般有料会員として上書きされる（許容）。降格側は `membership_type=general` ガードで巻き込みを防止する
- Checkout手続き中に管理者が却下した場合: 決済完了時点でユーザーが `rejected` であれば昇格しない（却下判断を決済完了で上書きしない）
- Webhookイベントの順序逆転・再送・同一event.idの並行配信: `stripe_events` へのINSERTをclaimとして使う原子的な排他制御と、Stripe APIから再取得したライブ状態のみを書き込むハンドラ設計で吸収する（イベントに埋め込まれたスナップショットは信用しない）
- claim後にサーバーレス関数がタイムアウト・強制終了しrelease処理へ到達できない場合: claimしたまま10分（`EVENT_CLAIM_TTL_MINUTES`）が経過すると再claim可能になる（ハンドラは冪等なため、まれに完了済みイベントを再実行しても実害は小さい）
- Stripe契約状況の取得エラー（`/upgrade`・`/admin/users`）: 「契約なし」に誤ってフォールバックせず、専用のエラーメッセージを表示する（フェイルクローズ）。特に管理画面での却下操作は、契約状況を判定できない場合も却下確認ダイアログに警告を表示する（却下操作自体は禁止せず、警告表示に留める意図的な判断。#95での会員種別変更UI検討時に再考の余地あり）

**スコープ外**: プランカタログ・複数通貨・クーポン・領収書カスタマイズ・却下時のサブスク自動キャンセル連携・年額プラン・プラン変更時のアンカー再設定・既存契約者へのアンカー移行（`billing_cycle_anchor_config` はサブスク作成時にのみ適用されるため、決済日固定の導入は本番での実課金開始前に行うことが前提）。

---

## 3. 学習コンテンツ配信機能

### 3.1 コンテンツ取得

サーバーサイドで Supabase から公開コンテンツを取得する。

**共通フィルタ条件**: `is_published = true AND is_deleted = false`
**共通ソート順**: `display_order` 昇順

取得可能なデータ:
- 公開テーマ一覧 / テーマ詳細
- テーマ内の公開フェーズ一覧 / フェーズ詳細（テーマ情報付き）
- フェーズ内の公開週一覧 / 週詳細（フェーズ・テーマ情報付き）
- 週内の公開コンテンツ一覧 / コンテンツ詳細（週・フェーズ・テーマ情報付き）

お試しユーザー（`status = 'pending'`）の場合、コンテンツ（`learning_contents`）はRLSにより `is_open_to_trial = true` の行のみが返る。ロック表示に必要なサマリー・存在チェックのみ service_role クライアントで別途取得する（2.6参照）。

### 3.2 コンテンツ種別ごとの表示

| 種別 | 表示方法 |
|:--|:--|
| 動画（video） | YouTube動画の埋め込み表示（URLからVideo IDを自動抽出、レスポンシブ対応） |
| テキスト（text） | Markdown形式で記述・表示（GFM対応）。DOMPurifyによるXSSサニタイズ |
| スライド（slide） | Supabase StorageのPDF URLを react-pdf でブラウザ内表示 |
| 演習（exercise） | Markdown形式の演習指示を表示。課題提出フォームと連携 |

### 3.3 画面遷移

```mermaid
flowchart TD
    A["/learn（Theme一覧）"] --> B["/learn/[themeId]（Phase一覧）"]
    B --> C["/learn/[themeId]/[phaseId]（Week・コンテンツ一覧）"]
    C --> D["/learn/[themeId]/[phaseId]/[weekId]/[contentId]（コンテンツ詳細）"]
```

各階層でパンくずリストを表示し、上位階層への導線を提供する。

---

## 4. 進捗管理機能

### 4.1 進捗記録 API

**エンドポイント**: `POST /api/progress`

**リクエストボディ**:
```json
{
  "contentId": 1,
  "userId": 1,
  "isCompleted": true
}
```

**処理フロー**:
1. リクエストボディのバリデーション（`contentId`, `userId` は必須）
2. `getServerAuth()` による認証チェック（ステータス取得を含む）
3. ユーザーID検証（認証ユーザーと一致するか）
4. ステータスに基づく認可: `rejected` は403
5. コンテンツ可視性チェック: **ステータスを問わず、対象 `contentId` が自分に可視でなければ403**（後述）
6. `user_progress` テーブルへの upsert
   - 完了時: `completed_at` に現在日時を設定
   - 未完了時: `completed_at` を null に設定

**可視性チェックの実装方法**: 通常クライアント（`authenticated`）で対象 `contentId` を SELECT し、0行なら403とする。`learning_contents` のRLSがステータスを織り込むため（データベース設計書の6.1参照）、アプリ層でステータス別の分岐を書く必要はない。この方式は「存在しない contentId」「未公開コンテンツ」も同時に弾ける。

**`active` ユーザーへの影響**: RLSに可視コンテンツ限定のEXISTS条件を追加した結果、`active` ユーザーも不可視コンテンツ（未公開・存在しないID）へは書き込めなくなる。従来は未公開コンテンツへの書き込みが素通りし、存在しないIDはFK違反で500になっていたが、いずれも403に統一される。

upsert は既存行がある場合 UPDATE 経路を通るため、RLS側も INSERT / UPDATE の双方に可視コンテンツ限定の条件を課す（データベース設計書の6.2参照）。

**レスポンス**:

| ステータス | 条件 |
|:--|:--|
| 200 | 正常（完了状態を返却） |
| 400 | バリデーションエラー |
| 401 | 未認証 |
| 403 | ユーザーID不一致 / `rejected` ユーザー / 対象コンテンツが自分に不可視（お試し非公開・未公開・存在しないID） |
| 500 | サーバーエラー |

### 4.2 進捗集計

ダッシュボードおよび一覧画面で表示する進捗率の計算:

```
進捗率 = (完了コンテンツ数 / 総コンテンツ数) × 100
```

**集計レベル**:
- **全体**: 全公開コンテンツ中の完了数
- **Phase単位**: Phase配下の全コンテンツ中の完了数
- **Week単位**: Week配下の全コンテンツ中の完了数

**お試しユーザーの分母**: 集計は通常クライアントのネスト select で行うため、お試しユーザーではRLSによる絞り込みがそのまま反映され、分母はお試し公開コンテンツのみとなる（体験範囲内の進捗を示す意図的な仕様。2.6参照）。

---

## 5. 課題提出機能

### 5.1 課題提出 API

**エンドポイント**: `POST /api/submissions`

**リクエストボディ**:
```json
{
  "contentId": 1,
  "userId": 1,
  "submissionType": "code",
  "codeContent": "function myFunction() { ... }",
  "url": null
}
```

**処理フロー**:
1. リクエストボディのバリデーション
   - `contentId`, `userId`, `submissionType` は必須
   - `code` タイプ: `codeContent` は必須
   - `url` タイプ: `url` は必須
2. `getServerAuth()` による認証チェック（ステータス取得を含む）
3. ユーザーID検証（認証ユーザーと一致するか）
4. ステータスに基づく認可: `rejected` は403
5. コンテンツ可視性チェック: ステータスを問わず、対象 `contentId` が自分に可視でなければ403（判定方法は4.1と同じ）
6. `submissions` テーブルへの INSERT

### 5.3 提出方法のコンテンツ別制御

演習コンテンツごとに許可する提出方法を `allowed_submission_types` で制御する。

| 値 | フォームの動作 |
|:--|:--|
| `'code'` | コード入力のみ表示（提出方法選択UI非表示） |
| `'url'` | URL入力のみ表示（提出方法選択UI非表示） |
| `'both'` | コード・URL両方から選択可 |

コンテンツ管理画面（`/manage/contents`）で演習コンテンツ作成・編集時に設定する。デフォルトは `'code'`。

### 5.4 コードエディタ

演習のコード提出フォームには、シンタックスハイライトと自動インデントを備えたコードエディタ（CodeMirror 6）を使用する。

**対応言語**（`code_language` カラムで演習ごとに設定）:

| 値 | 言語 | 用途例 |
|:--|:--|:--|
| `'javascript'` | JavaScript / GAS | GAS課題（デフォルト） |
| `'typescript'` | TypeScript | TypeScript課題 |
| `'html'` | HTML | フロントエンド課題 |
| `'css'` | CSS | スタイリング課題 |

**エディタ機能**:
- シンタックスハイライト
- 自動インデント・ブラケット補完
- ライト / ダークモード対応（OSテーマ連動）

**レスポンス**:

| ステータス | 条件 |
|:--|:--|
| 200 | 正常（提出データを返却） |
| 400 | バリデーションエラー |
| 401 | 未認証 |
| 403 | ユーザーID不一致 / `rejected` ユーザー / 対象コンテンツが自分に不可視（お試し非公開・未公開・存在しないID） |
| 500 | サーバーエラー |

### 5.5 ヒント表示

演習コンテンツに `hint` カラムが設定されている場合、課題提出フォームの上部にアコーディオン形式でヒントを表示する。

- ヒントはデフォルト折りたたみ（`<details>` タグ）で表示し、クリックで展開
- `hint` が `NULL` の場合はヒントUIを表示しない
- ヒント本文はMarkdown形式で記述可能（Markdownレンダリングは行わずプレーンテキストで表示）

ヒントはコンテンツ管理画面（`/manage/contents`）で演習コンテンツ作成・編集時に設定する。`reference_answer` などと同様に演習（`exercise`）専用の項目で、未入力の場合は `NULL` として保存される。

### 5.6 提出履歴

- **受講生**: 自分の提出履歴を提出日時の降順で取得（コンテンツ情報付き）
- **管理者**: 全受講生の提出一覧を提出日時の降順で取得（ユーザー・コンテンツ情報付き）

---

## 6. 管理機能

### 6.1 コンテンツ管理

Theme / Phase / Week / コンテンツそれぞれに対してCRUD操作が可能。削除は論理削除（`is_deleted = true`）。コンテンツ種別 `slide` では、PDF ファイルを Supabase Storage（`slides` バケット）にアップロードして `pdf_url` に保存する。テーマのサムネイル画像は Supabase Storage（`thumbnails` バケット）にアップロードして `image_url` に保存する。オブジェクトキーがテーマIDに依存するため、新規作成フォームではアップロードできず、テーマ作成後の編集画面から設定する。

**アクセス権限**: `admin` または `maintainer` ロール

**管理ルート**: `/manage` 配下（`/manage/themes`、`/manage/phases`、`/manage/weeks`、`/manage/contents`）

**お試し公開の設定**: コンテンツ作成・編集フォーム（`/manage/contents`）にチェックボックス「お試しユーザーにも公開する」を設け、`is_open_to_trial` を設定する。デフォルトは未チェック（`false`）で、種別を問わず全コンテンツで設定可能（2.6参照）。

### 6.1.1 PDFアップロード API

**エンドポイント**: `POST /api/upload-pdf`

**アクセス権限**: `admin` または `maintainer` ロール

**リクエスト**: `multipart/form-data`（最大50MB）

| フィールド | 必須 | 説明 |
|:--|:--|:--|
| `file` | ○ | アップロードする PDF ファイル |
| `folder` | - | 保存先フォルダ（コーススラッグ。例: `gas-advanced`）。英小文字・数字・ハイフンのみ |
| `slideNumber` | - | スライド番号。`folder` 指定時のみ有効。**文字列全体が半角数字のみ**で1以上の安全な整数（`Number.isSafeInteger()`）である場合のみ受理し、それ以外（`1abc` / `1.5` / `+1` / `1e2` / 全角数字 / 前後に空白を含む値 / 空文字 / 桁あふれ）は400（`folder` と異なり空白の除去は行わない）。**フィールド自体を送らなかった場合のみ**「指定なし」として自動採番へ回る。解釈は `parsePositiveInteger()`（`app/lib/positive-integer.ts`）に集約する |

**命名規約**: スライドは `slides` バケット内にオブジェクトキー `<コーススラッグ>/slide-NN.pdf` で保存する（NN は最低2桁のゼロ埋め。1〜99は `01`〜`99`、100以上は `100` のように桁が増える）。例: キー `gas/slide-01.pdf`・`gas-advanced/slide-03.pdf` → 公開URL `.../storage/v1/object/public/slides/gas/slide-01.pdf`。

**処理フロー**:
1. 認証チェック
2. ロール確認（admin / maintainer のみ許可）
3. 保存先オブジェクトキーの決定
   - `folder` 指定あり: `<folder>/slide-NN.pdf`
     - `slideNumber` 指定あり → その番号で保存（同名ファイルは上書き）
     - `slideNumber` 指定なし → 同フォルダ内の既存 `slide-NN.pdf` を走査し、最大値+1 で自動採番（走査失敗時は500）。番号部分の解釈は指定時と同じ基準のため、安全な整数として読めないファイル名は採番の基準から除外する。採番結果自体が安全な整数を超える場合は、同じ番号を採番し続けて永久に409になるのを避けるため400を返す（番号を明示指定すれば回避できる）
   - `folder` 指定なし: 後方互換のため `<timestamp>_<sanitizedName>` でバケット直下に保存
4. Supabase Storage の `slides` バケットにアップロード
5. 公開 URL と保存パスを返却

**レスポンス**:

| ステータス | 条件 |
|:--|:--|
| 200 | 正常（`{ url: string, path: string }` を返却） |
| 400 | ファイルなし / サイズ超過 / PDF以外 / フォルダ名不正 / 番号不正 / 自動採番の上限到達 |
| 403 | 権限なし |
| 500 | アップロード失敗（自動採番中の重複含む） / サーバーエラー |

### 6.1.2 AIレビュー API

**エンドポイント**: `POST /api/ai-review`

**アクセス権限**: 認証済みユーザー（自分の提出のみ対象）

**APIキーの振り分け**: `getServerAuth()` が返す `userStatus` によって使用するGemini APIキーを切り替える。`active`（コミュニティ会員・一般有料会員とも）は有料ティアの `GEMINI_API_KEY`、お試しユーザー（`pending`）は無料ティアの `GEMINI_API_KEY_TRIAL`（未設定時は `GEMINI_API_KEY` にフォールバック）を用いる。選択ロジックは `resolveGeminiApiKey()`（`app/services/api/gemini.ts`）に集約し、モデル名・上限値・環境変数名は `app/constants/gemini.ts` に定義する。キーはサーバー側でのみ扱い、レスポンス・ログへ出力しない。

**リクエストボディ**:
```json
{ "submissionId": 1 }
```

**処理フロー**:
1. 認証チェック
2. 提出データと関連コンテンツを取得
3. 本人の提出であることを確認
4. Gemini API にコード・演習指示・模範回答を送信してレビュー生成
5. `ai_reviews` テーブルに結果を upsert（`pending` → `processing` → `completed` / `failed`）

**レスポンス**:

| ステータス | 条件 |
|:--|:--|
| 200 | 正常（`{ review: AIReview }` を返却） |
| 400 | submissionId 未指定 |
| 403 | 他人の提出 |
| 404 | 提出データなし |
| 500 | Gemini API エラー / サーバーエラー |

### 6.1.3 ユーザー管理 API

**エンドポイント**: `PATCH /api/admin/users`

**アクセス権限**: `admin` ロールのみ

**リクエストボディ（ステータス変更）**:
```json
{ "userId": 1, "action": "approve", "membershipType": "community" }
{ "userId": 1, "action": "reject" }
```

`membershipType` に指定可能な値: `community`（コミュニティ会員） / `general`（一般有料会員）

**リクエストボディ（ロール変更）**:
```json
{ "userId": 1, "action": "change_role", "role": "maintainer" }
```

`role` に指定可能な値: `member` / `maintainer` / `admin`

**制約**:
- `admin` ロールのユーザーへのロール変更は不可（403）
- `userId` と `action` は必須（省略時は 400）
- `approve` では `membershipType` が必須（未指定・不正値は 400）。承認と同時に `status=active` と `membership_type` を更新する
- `reject` では `membership_type` を `NULL` に戻す

**レスポンス**:

| ステータス | 条件 |
|:--|:--|
| 200 | 正常（`{ success: true, action }` を返却） |
| 400 | バリデーションエラー |
| 403 | 管理者権限なし、または admin ユーザーへのロール変更 |
| 500 | DB 更新失敗 / サーバーエラー |

### 6.1.4 サムネイルアップロード API

テーマのサムネイル画像を Supabase Storage へアップロード・削除する。アップロード成功時は同一リクエスト内で `learning_themes.image_url` も更新するため、フォームの「更新」操作を待たずに反映される。

**エンドポイント**: `POST /api/upload-thumbnail`（アップロード） / `DELETE /api/upload-thumbnail`（削除）

**アクセス権限**: `admin` または `maintainer` ロール

**リクエスト（POST）**: `multipart/form-data`（最大5MB）

| フィールド | 必須 | 説明 |
|:--|:--|:--|
| `file` | ○ | アップロードする画像ファイル（`image/png` / `image/jpeg` / `image/webp`） |
| `themeId` | ○ | 対象テーマID（正の整数） |

**リクエスト（DELETE）**: クエリパラメータ `themeId`（正の整数）

**命名規約**: サムネイルは `thumbnails` バケット内にオブジェクトキー `theme-{themeId}/thumbnail.{ext}` で保存する（`ext` は `png` / `jpg` / `webp`）。`image_url` には環境非依存の相対パス `/storage/v1/object/public/thumbnails/theme-{id}/thumbnail.{ext}?v=<timestamp>` を保存し、表示時に `resolveStorageUrl()` が Supabase URL を前置する。`?v=` は差し替え時に Supabase CDN と `next/image` のキャッシュを切り替えるためのバージョン。

**処理フロー（POST）**:
1. 認証チェック
2. ロール確認（admin / maintainer のみ許可）
3. ファイル形式・サイズ・`themeId` の検証
4. 対象テーマの存在確認（`is_deleted = false`）。存在しない場合は Storage へ書き込まずに404
5. `thumbnails` バケットへアップロード（同一拡張子の既存オブジェクトは上書き）
6. `learning_themes.image_url` を `?v=<timestamp>` 付きの相対パスへ更新。更新に失敗した場合、既存オブジェクトを上書きしていないときに限り、今回作成したオブジェクトを削除する
7. 拡張子が変わって旧オブジェクトが残る場合は、DB更新の成功後にそれを削除する
8. 相対パスと公開URLを返却

**処理フロー（DELETE）**:
1. 認証チェック、ロール確認、`themeId` の検証
2. 対象テーマの存在確認（`is_deleted = false`）
3. `learning_themes.image_url` を `NULL` に更新
4. 更新前の `image_url` が上記の命名規約に一致する場合のみ、対応する Storage オブジェクトを削除する（`/images/...` 等の旧形式の値が入っていた場合はDBのクリアのみ行う）

Storage オブジェクトの削除に失敗した場合も、DB参照は既に外れているため 500 とはせず 200 を返し、`storageRemoved: false` で部分失敗を呼び出し側へ伝える（`image_url` が `NULL` 済みで再試行しても対象を特定できないため）。管理画面はこの値を見て「ファイルが残っている可能性がある」旨を警告表示する。

**レスポンス**:

| ステータス | 条件 |
|:--|:--|
| 200 | 正常（POST: `{ path: string, url: string }` / DELETE: `{ success: true, storageRemoved: boolean }` を返却） |
| 400 | ファイルなし / サイズ超過 / 対応形式以外 / テーマID不正 |
| 401 | 未認証 |
| 403 | 権限なし、または `rejected` ユーザー |
| 404 | テーマが存在しない、または論理削除済み |
| 500 | アップロード失敗 / DB更新失敗 / サーバーエラー |

### 6.2 受講生管理

アクティブな受講生の一覧と進捗状況を表示する。

**表示項目**: 表示名、メール、進捗率（完了数/総数）、最終アクティビティ日時

**アクセス権限**: `admin` ロールのみ

### 6.3 管理ダッシュボード

**パス**: `/admin`

**表示統計**: フェーズ数、週数、コンテンツ数、受講生数、提出数、最近の提出5件

**アクセス権限**: `admin` ロールのみ

---

## 7. 画面設計

### 7.1 認証系画面

| パス | 画面名 | 表示内容 |
|:--|:--|:--|
| `/login` | ログイン画面 | サービス名、「Googleでログイン」ボタン、サービス説明。`error=registration_failed` のときのみ登録失敗メッセージを表示（未知の `error` 値は何も出さない）。中央寄せレイアウト、ダークモード対応 |
| `/rejected` | 却下画面 | 却下メッセージ、問い合わせ案内、ログアウトボタン |

承認待ち専用画面（`/pending`）は設けない。お試しユーザーはダッシュボードを含む通常画面にアクセスでき、承認待ちであることはアプリ内バナーで通知する（2.6参照）。`/pending` へのアクセスは `/` にリダイレクトする。

### 7.2 受講生向け画面

| パス | 画面名 | 表示内容 |
|:--|:--|:--|
| `/` | ダッシュボード | 全体進捗率、Phase別進捗バー、学習への導線リンク |
| `/learn` | Theme一覧 | 公開Themeのカード一覧（名前、説明、サムネイル） |
| `/learn/[themeId]` | Phase一覧 | パンくずリスト、Phaseカード一覧（名前、説明） |
| `/learn/[themeId]/[phaseId]` | Week・コンテンツ一覧 | パンくずリスト、Week一覧と各Week内のコンテンツリスト（タイトル、種別アイコン、完了チェック） |
| `/learn/[themeId]/[phaseId]/[weekId]/[contentId]` | コンテンツ詳細 | パンくずリスト、コンテンツ本体、完了ボタン、提出フォーム（演習のみ）、前後ナビゲーション |
| `/submissions` | 提出履歴 | 提出一覧（提出日時、コンテンツ名、提出タイプ、内容プレビュー） |
| `/upgrade` | アップグレード | ステータス別の出し分け（2.11参照）。サイドナビ「プラン・お支払い」から全認証ユーザーがアクセス可能 |
| `/upgrade/success` | アップグレード完了 | Checkoutから戻った直後の決済確認・完了表示（2.11参照） |

### 7.3 管理・講師向け画面（`/manage`）

admin と maintainer が共通でアクセス可能。`/admin` および `/instructor` へのアクセスは `/manage` にリダイレクトされる。

| パス | 画面名 | 表示内容 |
|:--|:--|:--|
| `/manage` | 管理ダッシュボード | 統計カード（テーマ・フェーズ・週・コンテンツ・受講生・提出数）、最近の提出リスト |
| `/manage/themes` | テーマ管理 | CRUD操作（一覧、新規作成、編集、論理削除）、サムネイル画像のアップロード・プレビュー・削除（編集画面のみ） |
| `/manage/phases` | フェーズ管理 | CRUD操作（一覧、新規作成、編集、論理削除） |
| `/manage/weeks` | 週管理 | CRUD操作（一覧、新規作成、編集、論理削除） |
| `/manage/contents` | コンテンツ管理 | CRUD操作（一覧、新規作成、編集、論理削除）、PDFアップロード |
| `/manage/students` | 受講生一覧 | テーブル形式（表示名、メール、進捗率、最終アクティビティ） |
| `/manage/submissions` | 提出管理 | テーブル形式（受講生名、コンテンツ名、提出タイプ、提出日時） |

### 7.4 管理者専用画面

| パス | 画面名 | 表示内容 |
|:--|:--|:--|
| `/admin/users` | ユーザー管理 | ユーザー一覧、承認・却下・ロール変更操作 |

### 7.5 共通UIコンポーネント

| コンポーネント | 責務 |
|:--|:--|
| サイドナビゲーション | アプリ全体のナビゲーション。デスクトップは固定サイドバー、モバイルはドロワー。管理者メニューの動的表示。ログアウト機能 |
| パンくずリスト | ページヘッダーと階層ナビゲーションの表示 |
| Markdownレンダラー | Markdownの安全なレンダリング（DOMPurifyでサニタイズ → GFM対応Markdown変換 → Typographyスタイリング） |
| YouTube埋め込み | YouTube URLからVideo IDを抽出して動画を埋め込み表示 |
| 完了ボタン | コンテンツ完了状態のトグル。進捗記録APIを呼び出し |
| 提出フォーム | 課題提出フォーム。コンテンツの `allowed_submission_types` に応じてコード・URL・両方から選択して提出 |
| AIレビューボタン | 提出後にAIレビューをリクエストし、結果を提出履歴画面に表示 |
| PDF Viewer | Supabase Storage のPDFをブラウザ内で表示（react-pdf） |

---

## 8. エラーハンドリング

### 8.1 API Routes

| エラー種別 | HTTPステータス | ハンドリング |
|:--|:--|:--|
| バリデーションエラー | 400 | リクエストボディの必須項目チェック |
| 認証エラー | 401 | Supabase Auth のセッション不在 |
| 認可エラー | 403 | ユーザーID不一致（他人のデータ操作を防止） |
| Supabase エラー | 500 | DB操作失敗（サーバーログに出力） |
| 予期しないエラー | 500 | try-catch による一括ハンドリング |

### 8.2 認証エラー

| ケース | 対応 |
|:--|:--|
| Google認証キャンセル | `/login` に戻り、エラーメッセージを表示 |
| OAuth コード交換失敗 | `/login` にリダイレクト |
| セッション期限切れ | プロキシ（`proxy.ts`）が `/login` にリダイレクト |
| Supabase接続エラー | サーバーログに出力、`/login` にリダイレクト |
| ユーザー自動登録失敗 | サーバーログに出力し `/login?error=registration_failed` にリダイレクト（通知は送らない、セッション Cookie は付けない）。`/login` は許可リスト方式でメッセージ表示 |
| 論理削除済みユーザーの再ログイン | INSERT を試行せず、自動登録失敗と同じ導線（`/login?error=registration_failed`、セッション Cookie なし） |
| ユーザー存在確認の失敗 / service_role 未設定 | INSERT せず、`error` パラメータなしの `/login` へフェイルクローズ（セッション Cookie なし） |
| 重複登録の試行 | `auth_id` のUNIQUE制約で防止。既存レコードを使用 |

### 8.3 Server Services

- 全サービス関数は `{ data, error }` パターンで結果を返却
- エラー時はサーバーログに出力
- 呼び出し元でエラーに応じたUI表示を制御

---

## 9. Slack通知機能

### 9.1 概要

以下の2つの通知を、共通のSlack Incoming Webhook URL経由で管理者・運用者へ送る。通知先チャンネルはSlack Incoming Webhook URLの設定により決定する。

- **新規ユーザー承認依頼通知**: 初回ログイン時にユーザーが自動登録（`status=pending`）されると送信する
- **Stripe支払い失敗通知**（2.11節）: サブスクの請求が失敗（`invoice.payment_failed`）した際に送信する。初回失敗ではユーザーを降格せずStripe Smart Retriesに任せるため、運用者への通知のみを行う

**通知タイミング**: 新規ユーザー通知は `GET /auth/callback` における初回ユーザー登録の成功直後、支払い失敗通知は `POST /api/stripe/webhook` での `invoice.payment_failed` イベント受信時

**通知失敗時もメインフローは継続**: いずれもSlack通知の失敗は本体のフロー（ユーザー登録・リダイレクト、Webhookの200応答）に影響しない。エラーはサーバーログにのみ出力する。ただし呼び出し方は異なり、新規ユーザー通知は `await` せず発火するだけの非同期・非ブロッキング呼び出しであるのに対し、支払い失敗通知は `await` して待ち合わせる（関数内部で例外・HTTPエラーを捕捉して握り潰すため、待ち合わせても本体のフローを失敗させることはない）。詳細は9.5参照。

### 9.2 実装構成

| ファイル | 役割 |
|:--|:--|
| `app/services/notifications/slack.ts` | Slack Incoming Webhooks へのPOSTリクエスト送信ロジック（`sendSlackNewUserNotification()` / `sendSlackPaymentFailedNotification()`） |
| `app/auth/callback/route.ts` | 初回登録後に新規ユーザー通知を呼び出す |
| `app/api/stripe/webhook/route.ts` | `invoice.payment_failed` 受信時に支払い失敗通知を呼び出す |

### 9.3 環境変数

| 変数名 | 説明 | 必須 |
|:--|:--|:--:|
| `SLACK_NOTIFICATION_WEBHOOK_URL` | Slack Incoming Webhook URL（通知先チャンネルはWebhook設定で指定） | 任意 |

環境変数が未設定の場合は通知をスキップし、ログに警告を出力する。

### 9.4 Slack通知内容

**新規ユーザー承認依頼通知（メッセージフォーマット、Block Kit）**:

```
[タイトル] 🔔 新規ユーザーが承認を待っています

表示名:   <display_name>
メール:   <email>
登録日時: <registered_at> (JST)

[管理画面を開く] → <本番URL>/admin/users
```

**フィールド詳細**:

| フィールド | 値 | 取得元 |
|:--|:--|:--|
| 表示名 | Google表示名 | `user.user_metadata.full_name` |
| メール | Googleメール | `user.email` |
| 登録日時 | サーバー現在時刻をJST（`Asia/Tokyo`）でローカル日時文字列として表示 | サーバー現在時刻 |
| 管理画面リンク | `/admin/users` への絶対URL | `NEXT_PUBLIC_APP_URL` または `request.url` のorigin |

**Stripe支払い失敗通知（メッセージフォーマット、Block Kit）**:

```
[タイトル] ⚠️ Stripeの支払いに失敗しました

メール:   <customer_email>
請求額:   <amount_due>円

[請求書を開く] → <hosted_invoice_url>（取得できた場合のみ表示）
```

**フィールド詳細**:

| フィールド | 値 | 取得元 |
|:--|:--|:--|
| メール | Stripe請求先メール（無ければ「不明」） | `invoice.customer_email` |
| 請求額 | 請求金額をそのまま円表示（JPYはStripeのゼロdecimal通貨のため100で割らない。複数通貨対応はスコープ外） | `invoice.amount_due` |
| 請求書リンク | Stripeホスト型請求書ページのURL | `invoice.hosted_invoice_url` |

### 9.5 処理フロー

#### 9.5.1 新規ユーザー承認依頼通知

```mermaid
flowchart TD
    A["GET /auth/callback"] --> B["セッション確立"]
    B --> K{service_role 設定済み?}
    K -->|いいえ| L["ログ出力・/login にリダイレクト（error なし）"]
    K -->|はい| B2["users テーブル確認"]
    B2 --> C{users レコード}
    C -->|確認失敗| L
    C -->|未削除の既存| Z[通常のステータス判定]
    C -->|論理削除済み| Q["ログ出力・/login?error=registration_failed にリダイレクト（通知は送らない・セッション Cookie なし）"]
    C -->|なし| D["users テーブルに INSERT（pending）"]
    D --> E{INSERT 結果}
    E -->|成功| S[INSERT 成功]
    S --> F["sendSlackNewUserNotification()<br/>（非同期・await なし）"]
    S --> P["/ (ダッシュボード) にリダイレクト"]
    F --> G1{SLACK_NOTIFICATION_WEBHOOK_URL}
    G1 -->|未設定| H1[ログ警告・スキップ]
    G1 -->|設定あり| H2{Webhook POST}
    H2 -->|成功| I1[ログ出力]
    H2 -->|失敗| I2["エラーログ出力（フロー継続）"]
    E -->|失敗| Q
```

INSERT 成功後はお試しユーザーとしてダッシュボードへ遷移する。承認依頼のSlack通知は従来どおり送信し、管理者は `/admin/users` で承認・却下を行う。`sendSlackNewUserNotification()` は `await` せずに発火する非同期・非ブロッキング呼び出しで、通知の完了を待たずにリダイレクトへ進む。

INSERT 失敗時はログを出力し `/login?error=registration_failed` へリダイレクトする（通知は送らない）。論理削除済み（`is_deleted = true`）の既存レコードを持つユーザーの再ログインでは INSERT を試行せず、同じエラー導線へ流す。存在確認は論理削除済み行も含めて `auth_id` で照合する（通常の SELECT RLS では本人の削除済み行が見えないため、確認のみ RLS をバイパスする。INSERT は通常クライアントのまま）。存在確認に失敗した場合、および `SUPABASE_SERVICE_ROLE_KEY` 未設定時は INSERT せず、`error` パラメータなしの `/login` へフェイルクローズする。登録失敗・論理削除済み・確認失敗のエラー導線ではセッション Cookie を付けない。`/login` は `error` クエリ値を許可リスト方式（自前のキーのみ。プロトタイプ継承キーは含めない）で解釈し、`registration_failed` のときのみユーザー向けメッセージを表示する。未知の値では何も表示しない。

#### 9.5.2 Stripe支払い失敗通知

```mermaid
flowchart TD
    A["POST /api/stripe/webhook"] --> B["署名検証（stripe.webhooks.constructEvent）"]
    B -->|失敗| X["400 署名検証エラー"]
    B -->|成功| C["isEventProcessed() で処理済みか確認"]
    C -->|処理済み| Y["200 スキップ"]
    C -->|未処理| D{event.type}
    D -->|invoice.payment_failed| E["sendSlackPaymentFailedNotification()<br/>（await して待ち合わせる）"]
    E --> F["recordEventProcessed()"]
    F --> G["200 received"]
    D -->|その他のtype| H["対応するハンドラを実行"] --> F
```

`sendSlackPaymentFailedNotification()` は他のイベント種別のハンドラと同じく `await` して待ち合わせるが、関数内部で例外・HTTPエラーを捕捉して握り潰すため、Slack通知が失敗してもWebhookの200応答自体は失敗しない（9.5.1の新規ユーザー通知のような「発火して待たない」非同期呼び出しではない点に注意）。降格は行わず、通知のみでStripe Smart Retriesに任せる。

### 9.6 Slack Incoming Webhook 設定手順（運用）

1. Slack App を作成（または既存App を使用）
2. **Incoming Webhooks** を有効化
3. 通知先チャンネルを選択し、Webhook URL を発行
4. 発行した URL を `SLACK_NOTIFICATION_WEBHOOK_URL` 環境変数に設定
   - ローカル: `.env.local`
   - 本番: Vercel 環境変数

### 9.7 エラーハンドリング

| ケース | 対応 |
|:--|:--|
| `SLACK_NOTIFICATION_WEBHOOK_URL` 未設定 | ログ警告を出力し通知をスキップ。フローは継続 |
| Webhook POST がネットワークエラー | エラーログを出力し握り潰す。ユーザー登録・リダイレクト / Stripe Webhookの200応答は正常完了 |
| Webhook POST が 4xx / 5xx | エラーログ（ステータスコード含む）を出力し握り潰す |
| ユーザー INSERT 失敗 | 新規ユーザー通知は送信しない（中途半端な状態を通知しない）。`/login?error=registration_failed` へリダイレクトする |
| 支払い失敗通知自体の送信エラー | `recordEventProcessed()` はそのまま実行され、`/api/stripe/webhook` は200を返す（通知の成否はStripeへのWebhook応答に影響しない） |

---

## 改訂履歴

| 日付 | 内容 |
|:--|:--|
| 2026年2月 | 初版作成 |
| 2026年3月 | 認証方式を独立認証（Googleログイン + ユーザー承認）に変更。認証設計書を統合 |
| 2026年3月 | 設計書を簡素化。具体的な関数名・ファイルパスを除去し、メンテナンス性を向上 |
| 2026年3月 | 提出方法のコンテンツ別制御機能を追加（5.3節・提出フォームの説明を更新） |
| 2026年3月 | コードエディタ機能を追加（5.4節 CodeMirror 6によるシンタックスハイライト・自動インデント） |
| 2026年3月 | 演習コンテンツのヒント表示機能を追加（5.5節） |
| 2026年4月 | ユーザー管理画面にロール変更機能を追加（2.7節・6.1.3節・7.4節を更新。当時の節番号は2.6） |
| 2026年4月 | コンテンツ階層にThemeを追加し4階層化（3.1〜3.3節更新）。管理ルートを /manage に移行（6.1節・7.3節更新）。AIレビューAPI・PDFアップロードAPI追加（6.1.1〜6.1.2節）。スライドコンテンツ種別・PDF Viewerコンポーネント追記 |
| 2026年4月 | Slack通知機能を追加（セクション9）。アーキテクチャ図・レイヤー構成にNotification Servicesを追加 |
| 2026年5月 | PDFアップロードAPIに保存先フォルダ・連番ファイル名（`slides/<コース>/slide-NN.pdf`）対応を追加（6.1.1節）。自動採番・番号指定上書きに対応 |
| 2026年6月 | 演習課題のヒント（`hint`）を管理画面から設定する旨を設計に反映（5.5節） |
| 2026年7月 | 承認前ユーザーを「お試し（trial）ユーザー」と定義し、お試し公開コンテンツの閲覧・課題提出を許可する設計を追加（2.6節を新設し、以降の2.7〜2.10節を繰り下げ）。`/pending` 承認待ち画面の廃止に伴い認証フロー図・画面設計・エラーハンドリング・Slack通知フローを更新。API認証を `getServerAuth()` に一本化しステータスに基づく403判定を追記（4.1節・5.1節）。コンテンツ管理へのお試し公開設定を追記（6.1節） |
| 2026年8月 | 会員種別（コミュニティ会員 / 一般有料会員）を導入（2.3節に定義を追加、2.7節のユーザー管理に承認時の種別選択・表示項目を追記、6.1.3節のユーザー管理APIに `membershipType` パラメータを追記） |
| 2026年8月 | Stripe月額サブスク決済によるアップグレード機能を追加（2.11節を新設。2.3節に決済連携経路の説明を追記、2.7節にサブスク契約中バッジ・却下時の手動キャンセル警告を追記） |
| 2026年8月 | PR #98レビュー指摘を反映：Webhookイベントのclaim/release方式への変更、Stripe再取得によるTOCTOU対策、`/upgrade`・`/admin/users`のフェイルクローズ、月額料金表示、既知の限界（会員化の由来を区別できない点）を2.7節・2.11節に追記 |
| 2026年8月 | GitHub Copilotレビュー指摘を反映：claimのTTL救済、`activateUserFromCheckoutSession`のライブ状態取得を書き込み直前の1箇所に集約、契約取得エラー時もPortal導線を残す旨を2.11節に追記 |
| 2026年8月 | 別セッションからの追加レビュー指摘を反映：`paused`を終端状態に追加、successページの`no_payment_required`許容、既存Stripe Customerの再利用、月額料金のキャッシュ、`current_period_end`を用いた次回更新日・解約予定日の表示を2.11節に追記 |
| 2026年8月 | 上記に対する独立レビューの指摘を反映：既存Stripe Customerが見つからない場合の新規Customerへのフォールバックを2.11節に追記 |
| 2026年8月 | 決済日を毎月27日（UTC 0:00）に固定する変更を追加（#99）：`billing_cycle_anchor_config`・初回日割り（`proration_behavior`）・最低請求額を下回る場合の無償化ガード（`isProrationBelowMinimum()`）を2.11節に追記、`/upgrade`・`/upgrade/success`の画面説明を更新 |
| 2026年8月 | テーマサムネイルのStorageアップロード機能を追加（6.1.4節を新設。6.1節に `thumbnails` バケットへの保存と編集画面限定である旨、7.3節にアップロード・プレビュー・削除UIを追記） |
| 2026年8月 | `/upgrade` に課金の法定表示を追加（#134）。料金取得失敗時のフォールバック、非月額・非JPY時は月額を断定しないこと、Checkout API側の料金確認ガード（503）、契約状況取得失敗時は解約ポリシー文言を出さないことを2.11節に追記 |
| 2026年8月 | OAuthコールバックの users INSERT 失敗時と論理削除済みユーザー再ログイン時に `/login?error=registration_failed` へリダイレクトし、許可リスト方式でメッセージ表示する旨を2.4・2.5・8.2・9.5.1節に追記（#44） |
| 2026年9月 | #44 レビュー反映: service_role 未設定と存在確認失敗は `error` なしの `/login` へフェイルクローズすること、エラー導線ではセッション Cookie を付けないことを 8.2・9.5.1 に追記 |
| 2026年9月 | 並行Checkoutによる二重契約・二重課金の対策（#103）を2.11節に追記：Checkoutセッション作成前の処理権claim/releaseによる排他、Stripe Customerのユーザー単位の一意化、Checkout Sessionの有効期限を32分に固定する変更 |
| 2026年9月 | 上記へのレビュー指摘を反映（#103）：手続き中セッションの状態（open/expired/complete）に応じた再利用・奪取・待機、進行中claimを壊さないリプレイガード、TTLの導出（セッション有効期限＋猶予）を2.11節に追記 |
| 2026年9月 | 追加レビュー指摘を反映（#103）：ミラー更新のCAS、Checkout作成の結果が不明な場合は処理権を解放しないこと、セッションid未記録時のCustomer経由の復旧を2.11節に追記 |
