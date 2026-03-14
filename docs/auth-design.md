# 認証設計書

本書は、学習支援サービスの独立認証機能（Googleログイン + ユーザー承認フロー）の設計について記載する。

---

## 1. 概要

### 1.1 方針

本サービスは、シンラボポータルサイトとは**独立した認証基盤**を持つ。認証にはSupabase AuthのGoogle OAuthを使用し、ユーザー承認フローも本サービス内で完結させる。

### 1.2 背景

| 項目 | 説明 |
|:--|:--|
| サービス構成 | ポータルサイトと学習支援サービスは別のSupabaseプロジェクトを使用 |
| 開発体制 | 各サービスの開発チームが異なる |
| 認証方式 | 各サービスが独立してGoogle OAuthによるログイン機能を提供 |
| ユーザーの紐づけ | 同じGoogleアカウント（メールアドレス）で両サービスに個別にログイン |

### 1.3 全体構成

```
┌──────────────────────────────┐
│  学習支援サービス（本アプリ）    │
│                              │
│  ┌──────────┐  ┌──────────┐ │
│  │ ログイン   │  │ 学習機能  │ │
│  │ ページ    │  │ ダッシュ  │ │
│  │ (Google)  │  │ ボード等  │ │
│  └─────┬────┘  └─────┬────┘ │
│        │              │      │
│  ┌─────┴──────────────┴────┐ │
│  │     Supabase (独自)      │ │
│  │  ┌────────┐ ┌────────┐  │ │
│  │  │  Auth   │ │   DB   │  │ │
│  │  │(Google) │ │(users, │  │ │
│  │  │        │ │ learning│  │ │
│  │  │        │ │ _*)    │  │ │
│  │  └────────┘ └────────┘  │ │
│  └─────────────────────────┘ │
└──────────────────────────────┘
         ※ポータルサイトとは完全に独立
```

---

## 2. 認証フロー

### 2.1 Googleログインフロー

```
ユーザー          学習支援サービス        Google OAuth       Supabase Auth
  │                    │                    │                   │
  │  1. /login にアクセス│                    │                   │
  │───────────────────>│                    │                   │
  │                    │                    │                   │
  │  2. 「Googleでログイン」クリック          │                   │
  │───────────────────>│                    │                   │
  │                    │  3. signInWithOAuth │                   │
  │                    │───────────────────────────────────────>│
  │                    │                    │                   │
  │  4. Google認証画面   │                    │                   │
  │<───────────────────────────────────────│                   │
  │                    │                    │                   │
  │  5. Googleで認証     │                    │                   │
  │───────────────────────────────────────>│                   │
  │                    │                    │  6. code返却       │
  │                    │  7. /auth/callback  │                   │
  │───────────────────>│                    │                   │
  │                    │  8. exchangeCodeForSession              │
  │                    │───────────────────────────────────────>│
  │                    │  9. session確立     │                   │
  │                    │<───────────────────────────────────────│
  │                    │                    │                   │
  │                    │  10. ユーザー初回判定  │                   │
  │                    │      (users テーブル確認)                │
  │                    │                    │                   │
  │  11. リダイレクト    │                    │                   │
  │      初回: /pending │                    │                   │
  │      承認済: /      │                    │                   │
  │<───────────────────│                    │                   │
```

### 2.2 初回ログイン時のユーザー自動登録

OAuthコールバック処理中、またはクライアント側の `onAuthStateChange` で初回ログインを検知し、`users` テーブルにレコードを自動作成する。

**自動登録データ**:

| カラム | 値 | 取得元 |
|:--|:--|:--|
| `auth_id` | Supabase Auth UUID | `user.id` |
| `email` | Googleアカウントのメール | `user.email` |
| `display_name` | Google表示名 | `user.user_metadata.full_name` |
| `avatar_url` | Googleアバター画像 | `user.user_metadata.avatar_url` |
| `role` | `member` | デフォルト値 |
| `status` | `pending` | デフォルト値 |

### 2.3 ユーザーステータスによるアクセス制御

```
ログイン成功後
    │
    ├─ users テーブルにレコードなし
    │   → 自動登録 (status=pending) → /pending にリダイレクト
    │
    ├─ status = pending
    │   → /pending にリダイレクト（承認待ち画面）
    │
    ├─ status = rejected
    │   → /rejected にリダイレクト（却下画面）
    │
    └─ status = active
        → / (ダッシュボード) にリダイレクト
```

---

## 3. 実装設計

### 3.1 新規作成が必要なファイル

| ファイル | 種別 | 説明 |
|:--|:--|:--|
| `app/(auth)/login/page.tsx` | ページ | ログイン画面（Googleログインボタン） |
| `app/(auth)/login/components/google-login-button.tsx` | コンポーネント | Googleログインボタン |
| `app/(auth)/callback/route.ts` | APIルート | OAuthコールバック処理 |
| `app/(auth)/pending/page.tsx` | ページ | 承認待ち画面 |
| `app/(auth)/rejected/page.tsx` | ページ | 却下画面 |
| `app/(authenticated)/admin/users/page.tsx` | ページ | ユーザー管理画面（承認・却下） |
| `app/services/api/user-sync.ts` | サービス | ユーザー自動登録ロジック |

### 3.2 変更が必要な既存ファイル

| ファイル | 変更内容 |
|:--|:--|
| `middleware.ts` | リダイレクト先をポータルから本アプリの `/login` に変更。`/auth/callback`, `/pending`, `/rejected` を公開ルートに追加。`SKIP_AUTH` 分岐を削除 |
| `app/providers/supabase-auth-provider.tsx` | `onAuthStateChange` の `SIGNED_IN` イベントでユーザー自動登録を実行 |
| `app/(authenticated)/auth-layout.tsx` | `NEXT_PUBLIC_SKIP_AUTH` 分岐を削除。リダイレクト先を本アプリのページに変更 |
| `app/services/auth/server-auth.ts` | `SKIP_AUTH` 分岐を削除 |
| `app/services/auth/api-auth.ts` | `SKIP_AUTH` 分岐を削除 |
| `app/(authenticated)/components/side-nav.tsx` | ログアウト処理の追加。管理者向けに「ユーザー管理」メニューを追加 |

### 3.3 OAuthコールバックルート

**パス**: `app/(auth)/callback/route.ts`

**処理フロー**:
```
GET /auth/callback?code=xxx
    │
    ├─ code パラメータを取得
    │
    ├─ code なし → /login にリダイレクト
    │
    ├─ supabase.auth.exchangeCodeForSession(code)
    │   │
    │   ├─ 失敗 → /login にリダイレクト
    │   │
    │   └─ 成功 → users テーブル確認
    │       │
    │       ├─ レコードなし → 自動登録 (pending) → /pending
    │       ├─ pending → /pending
    │       ├─ rejected → /rejected
    │       └─ active → / (ダッシュボード)
```

### 3.4 ミドルウェア更新後のフロー

```
リクエスト受信
    │
    ├─ 静的ファイル / API / 認証ページ → スキップ
    │
    ├─ Supabase Auth セッション確認
    │   ├─ 未認証 → /login にリダイレクト
    │   │
    │   └─ 認証済み → ユーザーステータス確認
    │       ├─ ステータス取得失敗 → /pending にリダイレクト
    │       ├─ pending → /pending にリダイレクト
    │       ├─ rejected → /rejected にリダイレクト
    │       └─ active → NextResponse.next()
```

**変更点**: リダイレクト先がポータルURL (`PORTAL_URL`) から本アプリ内パス (`/login`, `/pending`, `/rejected`) に変更。

### 3.5 ユーザー管理画面（管理者向け）

**パス**: `/admin/users`

**アクセス権限**: `admin` ロールのみ

**機能**:
- 全ユーザー一覧の表示（ステータスでフィルタ可能）
- ユーザーの承認（`pending` → `active`）
- ユーザーの却下（`pending` → `rejected`）
- ステータス変更のリカバリ（`rejected` → `active`）

**表示項目**:

| 項目 | 説明 |
|:--|:--|
| 表示名 | Googleアカウントの名前 |
| メールアドレス | Googleアカウントのメール |
| ロール | `admin` / `maintainer` / `member` |
| ステータス | `pending` / `active` / `rejected` |
| 登録日時 | 初回ログイン日時 |
| 操作 | 承認 / 却下ボタン |

### 3.6 ログアウト機能

**実装箇所**: SideNavコンポーネント

**処理**:
1. `supabase.auth.signOut()` を呼び出し
2. `/login` にリダイレクト

---

## 4. セキュリティ設計

### 4.1 認証レイヤー

| レイヤー | 保護対象 | 方式 |
|:--|:--|:--|
| Middleware | 全ページ | Supabase Auth セッション + ユーザーステータス確認 |
| AuthLayout | Client Components | `useSupabaseAuth()` フックによるクライアント側ガード |
| RLS | データベース | `auth.uid()` によるRow Level Security |
| API Routes | データ更新操作 | `getApiAuth()` によるサーバー側認証 |

### 4.2 OAuth セキュリティ

| 項目 | 対策 |
|:--|:--|
| PKCE | Supabase Auth が自動的にPKCEフローを使用 |
| CSRF保護 | OAuth stateパラメータによるCSRF防止（Supabase管理） |
| セッション管理 | HTTP-only cookieでセッショントークンを管理 |
| トークン更新 | リフレッシュトークンによる自動更新 |

### 4.3 承認フローのセキュリティ

| リスク | 対策 |
|:--|:--|
| 未承認ユーザーのアクセス | ミドルウェア + RLSの二重チェック |
| ステータス改ざん | `users` テーブルの更新はRLSでadminロールのみに制限 |
| 自動登録の悪用 | Googleアカウントが必要。登録後は `pending` で管理者の承認が必須 |

---

## 5. Supabase設定

### 5.1 Google OAuth プロバイダー設定

Supabaseダッシュボードの Authentication > Providers で設定する。

**必要な情報**:
- Google Cloud ConsoleのOAuth 2.0クライアントID
- Google Cloud ConsoleのOAuth 2.0クライアントシークレット
- リダイレクトURI: `https://<supabase-project-id>.supabase.co/auth/v1/callback`

**Google Cloud Console側の設定**:
- 承認済みリダイレクトURI: Supabaseが提供するコールバックURLを追加
- 承認済みJavaScript生成元: 本アプリのドメインを追加

### 5.2 Supabase Auth 設定

| 設定項目 | 値 |
|:--|:--|
| Site URL | 本アプリのURL（`http://localhost:3000` / 本番URL） |
| Redirect URLs | `http://localhost:3000/auth/callback`, `https://本番ドメイン/auth/callback` |

---

## 6. 環境変数

### 6.1 必要な環境変数

| 変数名 | 用途 | 備考 |
|:--|:--|:--|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトURL | 既存 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase公開キー | 既存 |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Roleキー（管理操作用） | 既存 |
| `SUPABASE_PROJECT_ID` | SupabaseプロジェクトID | 既存 |

### 6.2 削除する環境変数

| 変数名 | 理由 |
|:--|:--|
| `SKIP_AUTH` | 独立認証の実装により不要 |
| `NEXT_PUBLIC_SKIP_AUTH` | 独立認証の実装により不要 |
| `NEXT_PUBLIC_PORTAL_URL` | ポータルへのリダイレクトが不要になるため削除 |

---

## 7. 画面設計

### 7.1 ログイン画面（`/login`）

**表示内容**:
- サービスロゴ / サービス名
- 「Googleでログイン」ボタン
- サービスの簡単な説明文

**デザイン方針**:
- シンプルで中央寄せのレイアウト
- ダークモード対応

### 7.2 承認待ち画面（`/pending`）

**表示内容**:
- 「承認待ちです」のメッセージ
- 管理者に承認を依頼する案内文
- ログアウトボタン

### 7.3 却下画面（`/rejected`）

**表示内容**:
- 「アクセスが却下されました」のメッセージ
- 管理者への問い合わせ案内
- ログアウトボタン

---

## 8. エラーハンドリング

### 8.1 認証エラー

| ケース | 対応 |
|:--|:--|
| Google認証キャンセル | `/login` に戻り、エラーメッセージを表示 |
| OAuth コード交換失敗 | `/login` にリダイレクト |
| セッション期限切れ | ミドルウェアが `/login` にリダイレクト |
| Supabase接続エラー | エラーログ出力、`/login` にリダイレクト |

### 8.2 ユーザー登録エラー

| ケース | 対応 |
|:--|:--|
| `users` テーブルへの INSERT 失敗 | エラーログ出力。ユーザーはログイン可能だがステータス確認不可のため `/pending` 表示 |
| 重複登録の試行 | `auth_id` のUNIQUE制約で防止。既存レコードを使用 |

---

## 9. テスト計画

### 9.1 正常系テスト

| テストケース | 期待動作 |
|:--|:--|
| 初回Googleログイン | ユーザー自動登録 → `/pending` 表示 |
| 管理者がユーザーを承認 | ステータスが `active` に変更 |
| 承認済みユーザーのログイン | ダッシュボード表示 |
| ログアウト | セッション破棄 → `/login` にリダイレクト |
| 再ログイン | 既存ユーザーとしてログイン（重複登録されない） |

### 9.2 異常系テスト

| テストケース | 期待動作 |
|:--|:--|
| Google認証をキャンセル | `/login` に戻る |
| `pending` ユーザーが直接 `/` にアクセス | `/pending` にリダイレクト |
| `rejected` ユーザーがログイン | `/rejected` にリダイレクト |
| 未認証で `/learn` にアクセス | `/login` にリダイレクト |
| 無効なcookieでアクセス | `/login` にリダイレクト |

---

## 10. ポータルサイトとの関係

### 10.1 独立性

| 項目 | ポータルサイト | 学習支援サービス |
|:--|:--|:--|
| Supabaseプロジェクト | 独自 | 独自 |
| 認証プロバイダー | Google OAuth | Google OAuth |
| `auth.users` | 独自 | 独自 |
| `public.users` | 独自 | 独自 |
| ユーザー承認 | 独自の承認フロー | 独自の承認フロー |
| ロール管理 | 独自 | 独自 |

### 10.2 ユーザーの共通性

- ユーザーは同じGoogleアカウントで両サービスに個別にログインする
- メールアドレスが共通の識別子となるが、`auth_id` は各サービスで異なる
- 各サービスで独立した承認が必要（ポータルで承認済みでも、学習支援サービスでは別途承認が必要）

---

## 改訂履歴

| 日付 | 内容 |
|:--|:--|
| 2026年3月 | 初版作成（独立認証方式） |
