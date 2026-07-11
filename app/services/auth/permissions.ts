import { USER_ROLE } from "@/app/constants/user";

// ユーザーが管理者権限か確認（null は権限なし）
export function checkAdminPermissions(role: string | null): boolean {
  return role === USER_ROLE.ADMIN;
}

// ユーザーがコンテンツ管理権限か確認（null は権限なし）
export function checkContentPermissions(role: string | null): boolean {
  return role === USER_ROLE.ADMIN || role === USER_ROLE.MAINTAINER;
}

// ユーザーが講師権限か確認（管理者とメンテナー、null は権限なし）
export function checkInstructorPermissions(role: string | null): boolean {
  return role === USER_ROLE.ADMIN || role === USER_ROLE.MAINTAINER;
}
