import type { MembershipType, UserStatusType } from "../types";
import { ALLOWED_USER_STATUSES, USER_MEMBERSHIP_LABELS, USER_STATUS } from "./user";

/**
 * Statuses an announcement can target (allowed values of announcements.target_statuses). Matches
 * the statuses that can use the app (ALLOWED_USER_STATUSES); rejected users are excluded.
 */
export const ANNOUNCEMENT_TARGET_STATUSES: readonly UserStatusType[] = ALLOWED_USER_STATUSES;

export const ANNOUNCEMENT_TARGET_STATUS_LABELS: Record<string, string> = {
  [USER_STATUS.ACTIVE]: "本登録ユーザー",
  [USER_STATUS.TRIAL]: "お試しユーザー",
};

export const ANNOUNCEMENT_MEMBERSHIP_LABELS: Record<MembershipType, string> =
  USER_MEMBERSHIP_LABELS;

export const DASHBOARD_UNREAD_ANNOUNCEMENT_LIMIT = 3;

/**
 * Cap on published announcements read to compute the unread count (newest first). The side-nav
 * badge is computed on every layout request, so keep the number of rows read small.
 */
export const UNREAD_ANNOUNCEMENT_SCAN_LIMIT = 100;

/** Max title/body length; shared by API input validation and the form. */
export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 200;
export const ANNOUNCEMENT_BODY_MAX_LENGTH = 20_000;

export const ANNOUNCEMENTS_PAGE_SIZE = 20;
