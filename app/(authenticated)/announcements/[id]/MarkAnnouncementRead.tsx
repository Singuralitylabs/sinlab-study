"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Records the read on opening the detail screen and refreshes the side-nav unread badge. Renders
 * only while unread (no recording or re-render once read). Failures don't block the display.
 */
export function MarkAnnouncementRead({ announcementId }: { announcementId: number }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/announcements/${announcementId}/read`, { method: "POST" })
      .then((response) => {
        if (response.ok && !cancelled) {
          router.refresh();
        }
      })
      .catch(() => {
        console.warn("お知らせの既読の記録に失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [announcementId, router]);

  return null;
}
