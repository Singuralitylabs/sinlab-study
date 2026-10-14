import { USER_ROLE } from "@/app/constants/user";

export function checkAdminPermissions(role: string | null): boolean {
  return role === USER_ROLE.ADMIN;
}

export function checkContentPermissions(role: string | null): boolean {
  return role === USER_ROLE.ADMIN || role === USER_ROLE.MAINTAINER;
}

export function checkInstructorPermissions(role: string | null): boolean {
  return role === USER_ROLE.ADMIN || role === USER_ROLE.MAINTAINER;
}

/** Learners take the courses; staff (admin / maintainer) run them and get no learning emails. */
export function isLearnerRole(role: string | null): boolean {
  return role === USER_ROLE.MEMBER;
}
