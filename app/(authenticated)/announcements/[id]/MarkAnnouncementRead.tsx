"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 詳細画面を開いたときに既読を記録し、サイドナビの未読バッジを更新する。
 * 未読のときだけ描画する（既読なら記録も再描画もしない）。失敗しても表示は止めない。
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
