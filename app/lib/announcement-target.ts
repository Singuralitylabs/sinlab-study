import type { Announcement } from "@/app/types";

type AnnouncementTarget = Pick<Announcement, "target_statuses" | "target_membership_types">;

/**
 * お知らせの対象ユーザーか（RLS の SELECT ポリシーと同じ条件をアプリ層で判定する）。
 * ステータスが `target_statuses` に含まれ、かつ `target_membership_types` が NULL（全種別）
 * または会員種別が含まれるユーザーだけが対象。お試しユーザー（会員種別 NULL）は、
 * 種別を指定したお知らせの対象にならない。
 *
 * 受講生向けの取得（二層防御のアプリ層）と、Cron の一斉送信の宛先抽出で共有する。
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

/** 対象の表示（例: 「本登録ユーザー（一般有料会員）/ お試しユーザー」）。管理画面の一覧で使う */
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
