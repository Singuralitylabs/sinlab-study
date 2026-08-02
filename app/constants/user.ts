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

/** 会員種別。承認時に管理者が選択する（承認前・却下ユーザーは null） */
export const USER_MEMBERSHIP: Record<string, MembershipType> = {
  COMMUNITY: "community",
  GENERAL: "general",
} as const;

export const USER_MEMBERSHIP_LABELS: Record<MembershipType, string> = {
  community: "コミュニティ会員",
  general: "一般有料会員",
} as const;
