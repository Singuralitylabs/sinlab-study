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
