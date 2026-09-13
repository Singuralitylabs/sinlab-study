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
