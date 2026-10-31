import { fetchUnreadAnnouncementCount } from "@/app/services/api/announcements-server";

// Async Server Component streamed through <Suspense> so the unread query never blocks the layout
// shell (a failure shows no badge).
export async function UnreadAnnouncementBadge() {
  const count = await fetchUnreadAnnouncementCount();
  if (!count) {
    return null;
  }
  return (
    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">（未読 {count} 件）</span>
    </span>
  );
}
