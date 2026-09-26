/**
 * proxy.ts から下流（Server Components / getServerAuth）へユーザー情報を
 * 引き渡すためのリクエストヘッダー名定数。
 *
 * 外部からのヘッダー偽装を防ぐため、proxy.ts では受信リクエストから
 * これらのヘッダーを必ず削除した上で、認証・DB取得に成功した場合のみ再設定する。
 */
export const AUTH_HEADERS = {
  AUTH_ID: "x-sinlab-auth-id",
  USER_ID: "x-sinlab-user-id",
  USER_STATUS: "x-sinlab-user-status",
  USER_ROLE: "x-sinlab-user-role",
} as const;

export const AUTH_HEADER_NAMES: readonly string[] = Object.values(AUTH_HEADERS);

/**
 * 初回登録時の利用規約・プライバシーポリシーへの同意を示す短寿命Cookie名。
 * `GoogleLoginButton` が `signInWithOAuth` 直前にセットし、
 * `app/auth/callback/route.ts` の初回登録分岐で必須チェックする。
 * OAuth の往復（Google → Supabase → `/auth/callback`）を跨いで届くよう
 * `SameSite=Lax`（トップレベル GET ナビゲーションで送信される）で運用する。
 */
export const TERMS_CONSENT_COOKIE_NAME = "sinlab-terms-consent";

/** 同意 Cookie にセットする値。callback 側の有無判定と一致させること。 */
export const TERMS_CONSENT_COOKIE_VALUE = "1";

/**
 * 同意 Cookie の有効期間（秒）。Google 側のアカウント選択・2段階認証などで
 * OAuth の往復が長引いても失効しないよう30分とする。Cookie は callback の全経路で
 * 削除され、INSERT 可否の判定にしか使わない（同意の記録は `terms_accepted_at`）。
 */
export const TERMS_CONSENT_COOKIE_MAX_AGE = 1800;

/** 同意なしの初回登録で `/login` に戻す際の `error` クエリ値。 */
export const TERMS_REQUIRED_ERROR_CODE = "terms_required";
