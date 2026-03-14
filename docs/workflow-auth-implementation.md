# 独立認証機能 実装ワークフロー

本書は、学習支援サービスに独立したGoogleログイン + ユーザー承認機能を実装するための作業手順をまとめたものである。

---

## 前提条件

- 学習支援サービスのリポジトリ: 本リポジトリ
- Supabaseプロジェクトが作成済みであること
- Google Cloud Consoleへのアクセスがあること（OAuth設定用）

---

## Phase 1: Supabase設定

### Step 1.1: Google OAuthプロバイダーの設定

**作業場所**: Supabaseダッシュボード + Google Cloud Console

**作業内容**:
1. Google Cloud Consoleで OAuth 2.0 クライアントIDを作成（未作成の場合）
   - アプリケーションタイプ: ウェブアプリケーション
   - 承認済みリダイレクトURI: Supabaseが提供するコールバックURLを追加
2. Supabaseダッシュボード > Authentication > Providers > Google を有効化
   - Client ID と Client Secret を設定
3. Supabaseダッシュボード > Authentication > URL Configuration
   - Site URL: `http://localhost:3000`（開発環境）
   - Redirect URLs: `http://localhost:3000/auth/callback` を追加

**確認項目**:
- [ ] Supabaseの Google プロバイダーが Enabled になっていること
- [ ] Redirect URLs に `http://localhost:3000/auth/callback` が含まれること

---

### Step 1.2: usersテーブルの作成（未作成の場合）

**作業場所**: Supabase SQL Editor またはマイグレーションファイル

**作業内容**:
- `users` テーブルがスキルアップ側のSupabaseプロジェクトに存在するか確認
- 存在しない場合は、既存のマイグレーション（`001_create_learning_tables.sql`）に含まれるスキーマに基づき作成
- RLSポリシーを設定

**確認項目**:
- [ ] `users` テーブルが存在し、必要なカラム（auth_id, email, display_name, role, status等）があること
- [ ] RLSが有効で、適切なポリシーが設定されていること

---

## Phase 2: 認証ページの実装

### Step 2.1: ログインページの作成

**ファイル**: `app/(auth)/login/page.tsx`（新規）

**作業内容**:
- ログインページのレイアウトを作成
- 中央寄せ、サービス名、「Googleでログイン」ボタン
- ダークモード対応のスタイリング

**確認項目**:
- [ ] `/login` にアクセスするとログインページが表示されること
- [ ] レスポンシブ対応（モバイル/デスクトップ）

---

### Step 2.2: Googleログインボタンの作成

**ファイル**: `app/(auth)/login/components/google-login-button.tsx`（新規）

**作業内容**:
- `supabase.auth.signInWithOAuth({ provider: "google" })` を呼び出すボタン
- `redirectTo` に `/auth/callback` を指定
- ローディング状態の表示
- エラーハンドリング

**確認項目**:
- [ ] ボタンクリックでGoogleの認証画面にリダイレクトされること

---

### Step 2.3: OAuthコールバックルートの作成

**ファイル**: `app/(auth)/callback/route.ts`（新規）

**作業内容**:
- `GET` ハンドラを作成
- `searchParams` から `code` を取得
- `supabase.auth.exchangeCodeForSession(code)` でセッション確立
- `users` テーブルでユーザーの存在・ステータスを確認
- ユーザーが存在しない場合は自動登録（`status=pending`）
- ステータスに応じたリダイレクトを実行

**確認項目**:
- [ ] Google認証後にコールバックが正常に処理されること
- [ ] 初回ログイン時にユーザーが自動登録されること
- [ ] ステータスに応じて正しいページにリダイレクトされること

---

### Step 2.4: 承認待ちページの作成

**ファイル**: `app/(auth)/pending/page.tsx`（新規）

**作業内容**:
- 「承認待ちです」のメッセージ表示
- 管理者への連絡先案内
- ログアウトボタン

**確認項目**:
- [ ] `/pending` にアクセスすると承認待ち画面が表示されること

---

### Step 2.5: 却下ページの作成

**ファイル**: `app/(auth)/rejected/page.tsx`（新規）

**作業内容**:
- 「アクセスが却下されました」のメッセージ表示
- 問い合わせ先案内
- ログアウトボタン

**確認項目**:
- [ ] `/rejected` にアクセスすると却下画面が表示されること

---

## Phase 3: ミドルウェア・認証基盤の更新

### Step 3.1: ミドルウェアの更新

**ファイル**: `middleware.ts`

**作業内容**:
- `SKIP_AUTH` 分岐を削除
- `PORTAL_URL` 関連のロジックを削除
- リダイレクト先を本アプリ内のパスに変更:
  - 未認証 → `/login`
  - pending → `/pending`
  - rejected → `/rejected`
- `shouldSkipMiddleware()` に認証ページのパスを追加:
  - `/login`, `/auth/callback`, `/pending`, `/rejected`

**確認項目**:
- [ ] 未認証ユーザーが `/login` にリダイレクトされること
- [ ] 認証ページ（`/login`, `/pending`, `/rejected`）はミドルウェアをスキップすること
- [ ] `active` ユーザーが正常にアクセスできること

---

### Step 3.2: AuthProviderの更新

**ファイル**: `app/providers/supabase-auth-provider.tsx`

**作業内容**:
- `onAuthStateChange` の `SIGNED_IN` イベントでユーザー自動登録のロジックを追加
- 初回ログイン時: `users` テーブルにレコードを作成（`status=pending`, `role=member`）
- 既存ユーザー: スキップ（重複登録防止）

**確認項目**:
- [ ] 初回ログイン時に `users` テーブルにレコードが作成されること
- [ ] 2回目以降のログインで重複レコードが作成されないこと

---

### Step 3.3: AuthLayoutの更新

**ファイル**: `app/(authenticated)/auth-layout.tsx`

**作業内容**:
- `NEXT_PUBLIC_SKIP_AUTH` 分岐を削除
- リダイレクト先を本アプリ内のパスに変更

**確認項目**:
- [ ] クライアント側のガードが正しく動作すること

---

### Step 3.4: サーバー認証ヘルパーの更新

**ファイル**: `app/services/auth/server-auth.ts`, `app/services/auth/api-auth.ts`

**作業内容**:
- `SKIP_AUTH` 分岐を削除
- 常にSupabase Auth経由の認証フローを使用

**確認項目**:
- [ ] Server Componentsが正しく認証ユーザーを取得できること
- [ ] API Routesが正しく認証チェックを行うこと

---

## Phase 4: ユーザー管理機能の実装

### Step 4.1: ユーザー管理サービスの作成

**ファイル**: `app/services/api/admin-server.ts`（既存に追加）または `app/services/api/users-admin.ts`（新規）

**作業内容**:
- `fetchAllUsers()`: 全ユーザー一覧の取得（ステータスフィルタ対応）
- `approveUser(userId)`: ユーザーの承認（`status` を `active` に更新）
- `rejectUser(userId)`: ユーザーの却下（`status` を `rejected` に更新）

**確認項目**:
- [ ] 各関数が正しくDB操作を行うこと

---

### Step 4.2: ユーザー管理画面の作成

**ファイル**: `app/(authenticated)/admin/users/page.tsx`（新規）

**作業内容**:
- 全ユーザー一覧テーブル（表示名、メール、ロール、ステータス、登録日時）
- ステータスフィルタ（全て / pending / active / rejected）
- 承認・却下ボタン（`pending` ユーザーに対して表示）
- 確認ダイアログ

**確認項目**:
- [ ] ユーザー一覧が表示されること
- [ ] 承認ボタンでステータスが `active` に変わること
- [ ] 却下ボタンでステータスが `rejected` に変わること
- [ ] `admin` ロール以外はアクセスできないこと

---

### Step 4.3: SideNavにユーザー管理リンクを追加

**ファイル**: `app/(authenticated)/components/side-nav.tsx`

**作業内容**:
- 管理者メニューに「ユーザー管理」リンクを追加
- ログアウトボタンの動作を `supabase.auth.signOut()` + `/login` リダイレクトに更新

**確認項目**:
- [ ] 管理者にのみ「ユーザー管理」リンクが表示されること
- [ ] ログアウトが正しく動作すること

---

## Phase 5: クリーンアップ

### Step 5.1: 不要なコード・環境変数の削除

**作業内容**:
- `SKIP_AUTH` / `NEXT_PUBLIC_SKIP_AUTH` 関連のコードが完全に削除されていることを確認
- `NEXT_PUBLIC_PORTAL_URL` の参照を削除
- Vercelダッシュボードから以下の環境変数を削除:
  - `SKIP_AUTH=true`
  - `NEXT_PUBLIC_SKIP_AUTH=true`
- `.env.local.example` を更新（不要な変数を削除、Google OAuth関連の説明を追加）

**確認項目**:
- [ ] `SKIP_AUTH` への参照がコード内に残っていないこと
- [ ] `PORTAL_URL` への参照がコード内に残っていないこと（必要に応じてリンクとして残す場合を除く）
- [ ] `.env.local.example` が最新状態を反映していること

---

### Step 5.2: ドキュメント更新

**作業内容**:
- `CLAUDE.md` の「TODO: クロスドメイン認証の実装」セクションを削除または更新
- `CLAUDE.md` の認証フローの記述を独立認証方式に更新
- 旧設計書の削除:
  - `docs/cross-domain-auth-design.md`（不要）
  - `docs/workflow-cross-domain-auth.md`（不要）

**確認項目**:
- [ ] CLAUDE.md が現在の実装状態を正確に反映していること
- [ ] 旧設計書が削除されていること

---

## Phase 6: テスト

### Step 6.1: 手動テスト

**テストシナリオ**:

| # | シナリオ | 期待結果 |
|:--|:--|:--|
| 1 | `/login` にアクセス | ログイン画面表示 |
| 2 | 「Googleでログイン」クリック | Google認証画面に遷移 |
| 3 | Google認証を完了（初回） | ユーザー自動登録 → `/pending` 表示 |
| 4 | 管理者が `/admin/users` で承認 | ステータスが `active` に変更 |
| 5 | 承認済みユーザーが再ログイン | ダッシュボード表示 |
| 6 | ダッシュボードで各機能を操作 | 正常動作（コンテンツ閲覧、進捗更新等） |
| 7 | ログアウト | セッション破棄 → `/login` にリダイレクト |
| 8 | 未認証で `/learn` にアクセス | `/login` にリダイレクト |
| 9 | `pending` ユーザーで `/` にアクセス | `/pending` にリダイレクト |
| 10 | `rejected` ユーザーでログイン | `/rejected` にリダイレクト |
| 11 | `member` ロールで `/admin/users` にアクセス | アクセス拒否 |
| 12 | Google認証をキャンセル | `/login` に戻る |

**確認項目**:
- [ ] 全テストシナリオがパスすること
- [ ] ブラウザのDevToolsでSupabase cookieが正しく設定されていること
- [ ] コンソールにエラーが出力されていないこと
- [ ] モバイル表示で問題がないこと

---

## 作業順序のまとめ

```
Phase 1 (Supabase設定)
  Step 1.1: Google OAuthプロバイダー設定
  Step 1.2: usersテーブル確認/作成
       │
Phase 2 (認証ページ)
  Step 2.1: ログインページ
  Step 2.2: Googleログインボタン
  Step 2.3: OAuthコールバックルート
  Step 2.4: 承認待ちページ
  Step 2.5: 却下ページ
       │
Phase 3 (認証基盤更新)
  Step 3.1: ミドルウェア更新
  Step 3.2: AuthProvider更新
  Step 3.3: AuthLayout更新
  Step 3.4: サーバー認証ヘルパー更新
       │
Phase 4 (ユーザー管理)
  Step 4.1: ユーザー管理サービス
  Step 4.2: ユーザー管理画面
  Step 4.3: SideNav更新
       │
Phase 5 (クリーンアップ)
  Step 5.1: 不要コード・環境変数削除
  Step 5.2: ドキュメント更新
       │
Phase 6 (テスト)
  Step 6.1: 手動テスト
```

---

## 改訂履歴

| 日付 | 内容 |
|:--|:--|
| 2026年3月 | 初版作成（独立認証方式） |
