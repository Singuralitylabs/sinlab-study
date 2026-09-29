import type { MembershipType, UserStatusType } from "../types";
import { ALLOWED_USER_STATUSES, USER_MEMBERSHIP_LABELS, USER_STATUS } from "./user";

/**
 * お知らせの対象にできるステータス（`announcements.target_statuses` の許可値）。
 * アプリを利用できるステータス（`ALLOWED_USER_STATUSES`）と一致させる（却下ユーザーは対象外）
 */
export const ANNOUNCEMENT_TARGET_STATUSES: readonly UserStatusType[] = ALLOWED_USER_STATUSES;

export const ANNOUNCEMENT_TARGET_STATUS_LABELS: Record<string, string> = {
  [USER_STATUS.ACTIVE]: "本登録ユーザー",
  [USER_STATUS.TRIAL]: "お試しユーザー",
};

/** 会員種別の表示名（対象の表示に使う。値の列挙は `MEMBERSHIP_TYPES`） */
export const ANNOUNCEMENT_MEMBERSHIP_LABELS: Record<MembershipType, string> =
  USER_MEMBERSHIP_LABELS;

/** ダッシュボードに表示する未読のお知らせの最大件数 */
export const DASHBOARD_UNREAD_ANNOUNCEMENT_LIMIT = 3;

/**
 * 未読件数の算出で読む公開済みお知らせの上限（新しい順）。サイドナビのバッジは
 * レイアウトで毎リクエスト算出するため、読み込む件数を抑える
 */
export const UNREAD_ANNOUNCEMENT_SCAN_LIMIT = 100;

/** お知らせのタイトル・本文の最大文字数（API の入力検証とフォームで共有） */
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 200;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 20_000;

/** お知らせ一覧（`/announcements`）の1ページの件数 */
export const ANNOUNCEMENTS_PAGE_SIZE = 20;
