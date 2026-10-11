import type { MembershipType, UserRoleType, UserStatusType } from "../types";

/**
 * User status. Annotating with Record<string, UserStatusType> would disable `as const`, letting key
 * typos pass type checks and become undefined at runtime; validate only the values with
 * `satisfies`, as USER_MEMBERSHIP does.
 */
export const USER_STATUS = {
  TRIAL: "trial",
  ACTIVE: "active",
  REJECTED: "rejected",
} as const satisfies Record<string, UserStatusType>;

/** Statuses allowed through auth (shared by proxy / layout / server-auth). */
export const ALLOWED_USER_STATUSES: readonly UserStatusType[] = [
  USER_STATUS.ACTIVE,
  USER_STATUS.TRIAL,
];

export const USER_ROLE = {
  ADMIN: "admin",
  MAINTAINER: "maintainer",
  MEMBER: "member",
} as const satisfies Record<string, UserRoleType>;

/** Single source for allowed roles; API validation derives from it. */
export const USER_ROLES: readonly UserRoleType[] = Object.values(USER_ROLE);

/**
 * Membership type, chosen by the admin on approval (null before approval and for rejected users).
 * Same `satisfies` rationale as USER_STATUS: a Record annotation would disable `as const`, so typos
 * like USER_MEMBERSHIP.COMUNITY would pass type checks and be undefined at runtime.
 */
export const USER_MEMBERSHIP = {
  COMMUNITY: "community",
  GENERAL: "general",
} as const satisfies Record<string, MembershipType>;

export const USER_MEMBERSHIP_LABELS: Record<MembershipType, string> = {
  community: "コミュニティ会員",
  general: "一般有料会員",
} as const;

/** Single source for allowed values; API validation and the approval UI options derive from it. */
export const MEMBERSHIP_TYPES: readonly MembershipType[] = Object.values(USER_MEMBERSHIP);

/** Allowed PATCH /api/admin/users actions; validation derives from here. */
export const USER_MANAGEMENT_ACTIONS = [
  "approve",
  "reject",
  "change_role",
  "change_membership",
  "resume_email",
  "opt_out_email",
] as const;
export type UserManagementAction = (typeof USER_MANAGEMENT_ACTIONS)[number];
