import type { Announcement } from "@/app/types";

type AnnouncementTarget = Pick<Announcement, "target_statuses" | "target_membership_types">;

/**
 * Whether the user is a target of the announcement (same condition as the RLS SELECT policy,
 * evaluated at the app layer). Status must be in target_statuses, and target_membership_types must
 * be NULL (all types) or include the user's type. Trial users (membership type NULL) are never
 * targeted by announcements that specify types. Shared by the student-facing fetch (app-layer half
 * of the two-layer defense) and recipient selection for cron broadcasts.
 */
export function isAnnouncementTarget(
  announcement: AnnouncementTarget,
  user: { status: string | null; membershipType: string | null }
): boolean {
  if (!user.status || !announcement.target_statuses.includes(user.status)) {
    return false;
  }
  if (announcement.target_membership_types === null) {
    return true;
  }
  return (
    user.membershipType !== null &&
    announcement.target_membership_types.includes(user.membershipType)
  );
}

export function describeAnnouncementTargets(
  announcement: AnnouncementTarget,
  labels: { status: Record<string, string>; membership: Record<string, string> }
): string {
  const statuses = announcement.target_statuses.map((status) => labels.status[status] ?? status);
  if (announcement.target_membership_types === null) {
    return statuses.join(" / ");
  }
  const types = announcement.target_membership_types
    .map((type) => labels.membership[type] ?? type)
    .join("・");
  return `${statuses.join(" / ")}（${types}）`;
}
