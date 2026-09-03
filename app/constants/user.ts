import type { MembershipType, UserRoleType, UserStatusType } from "../types";

export const USER_STATUS: Record<string, UserStatusType> = {
  PENDING: "pending",
  ACTIVE: "active",
  REJECTED: "rejected",
} as const;

export const USER_ROLE: Record<string, UserRoleType> = {
  ADMIN: "admin",
  MAINTAINER: "maintainer",
  MEMBER: "member",
} as const;

/** ロールの許可値。APIのバリデーション等はこの1箇所から導出する */
export const USER_ROLES: readonly UserRoleType[] = Object.values(USER_ROLE);

/**
 * 会員種別。承認時に管理者が選択する（承認前・却下ユーザーは null）。
 *
 * `Record<string, MembershipType>` の型注釈を付けると `as const` が無効化され、
 * キーのtypo（`USER_MEMBERSHIP.COMUNITY` 等）が型チェックを通り実行時 undefined に
 * なるため、`satisfies` で値だけを検証する。
 */
export const USER_MEMBERSHIP = {
  COMMUNITY: "community",
  GENERAL: "general",
} as const satisfies Record<string, MembershipType>;

export const USER_MEMBERSHIP_LABELS: Record<MembershipType, string> = {
  community: "コミュニティ会員",
  general: "一般有料会員",
} as const;

/** 会員種別の許可値。APIのバリデーションと承認UIの選択肢はこの1箇所から導出する */
export const MEMBERSHIP_TYPES: readonly MembershipType[] = Object.values(USER_MEMBERSHIP);
