import { describe, expect, it } from "vitest";
import {
  addDays,
  coversPreviousWeek,
  type DigestContent,
  type DigestUser,
  daysSinceSignup,
  isWeeklyDigestTarget,
  jstStartOfDayIso,
  lockedThemeNames,
  planMilestoneEmails,
  resolveNextContent,
  toJstDateString,
  visibleContentsFor,
  weekStartOf,
} from "@/app/lib/email-digest";

describe("JST の暦日", () => {
  it("UTC 15:00 を境に JST の日付が変わる", () => {
    expect(toJstDateString(new Date("2026-10-04T14:59:59Z"))).toBe("2026-10-04");
    expect(toJstDateString(new Date("2026-10-04T15:00:00Z"))).toBe("2026-10-05");
  });

  it("Cron の起動時刻（UTC 23 時台）は JST の翌日 8 時台として扱う", () => {
    expect(toJstDateString(new Date("2026-10-04T23:00:00Z"))).toBe("2026-10-05");
    expect(toJstDateString(new Date("2026-10-04T23:59:00Z"))).toBe("2026-10-05");
  });

  it("暦日の加減算は月・年をまたげる", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("JST 0:00 を UTC の ISO 文字列にする", () => {
    expect(jstStartOfDayIso("2026-10-05")).toBe("2026-10-04T15:00:00.000Z");
  });
});

describe("weekStartOf（週の開始日 = 月曜）", () => {
  it.each([
    ["2026-10-05", "2026-10-05"], // 月曜
    ["2026-10-06", "2026-10-05"], // 火曜
    ["2026-10-11", "2026-10-05"], // 日曜
    ["2026-10-12", "2026-10-12"], // 翌週の月曜
  ])("%s の週の開始日は %s", (date, expected) => {
    expect(weekStartOf(date)).toBe(expected);
  });
});

describe("daysSinceSignup", () => {
  it("created_at を JST の暦日に丸め、登録日を 0 日目とする", () => {
    // 2026-09-28 23:30 JST に登録
    const createdAt = "2026-09-28T14:30:00Z";
    expect(daysSinceSignup(createdAt, "2026-09-28")).toBe(0);
    expect(daysSinceSignup(createdAt, "2026-10-05")).toBe(7);
  });

  it("UTC では前日でも JST で翌日になる登録は、JST の日付で数える", () => {
    // 2026-09-29 00:30 JST（UTC では 9/28）に登録
    const createdAt = "2026-09-28T15:30:00Z";
    expect(daysSinceSignup(createdAt, "2026-10-05")).toBe(6);
    expect(daysSinceSignup(createdAt, "2026-10-06")).toBe(7);
  });
});

describe("coversPreviousWeek（週次進捗の対象になれる登録日）", () => {
  it("前週の月曜（JST）以前に登録していれば対象、それより後なら対象外", () => {
    expect(coversPreviousWeek("2026-09-28T03:00:00Z", "2026-10-05")).toBe(true); // 前週の月曜
    expect(coversPreviousWeek("2026-09-20T03:00:00Z", "2026-10-05")).toBe(true);
    expect(coversPreviousWeek("2026-09-29T03:00:00Z", "2026-10-05")).toBe(false); // 前週の火曜
    expect(coversPreviousWeek("2026-10-04T03:00:00Z", "2026-10-05")).toBe(false); // 前週の日曜
  });

  it("前週の月曜 0:00 JST の境界を JST の暦日で判定する", () => {
    expect(coversPreviousWeek("2026-09-27T15:00:00Z", "2026-10-05")).toBe(true); // 9/28 0:00 JST
    expect(coversPreviousWeek("2026-09-28T14:59:59Z", "2026-10-05")).toBe(true); // 9/28 23:59 JST
    expect(coversPreviousWeek("2026-09-28T15:00:00Z", "2026-10-05")).toBe(false); // 9/29 0:00 JST
  });
});

function user(userId: number, status: "active" | "trial", createdAt: string): DigestUser {
  return {
    userId,
    email: `u${userId}@example.com`,
    displayName: `u${userId}`,
    status,
    membershipType: null,
    createdAt,
  };
}

describe("planMilestoneEmails", () => {
  const today = "2026-10-15";
  // JST 正午に登録した日付から逆算（today - N 日）
  const signedUp = (days: number) => `${addDays(today, -days)}T03:00:00Z`;

  it("お試しユーザーは登録から 2・5・7・14 日目に trial_nurture の対象になる", () => {
    const users = [2, 3, 5, 7, 14, 15].map((d) => user(d, "trial", signedUp(d)));

    const { trialNurture } = planMilestoneEmails(users, today);

    expect(trialNurture.map(({ user, day }) => [user.userId, day])).toEqual([
      [2, 2],
      [5, 5],
      [7, 7],
      [14, 14],
    ]);
  });

  it("未学習リマインドの候補は登録から 7・14 日目のユーザー", () => {
    const users = [6, 7, 8, 14].map((d) => user(d, "active", signedUp(d)));

    const { inactivityCandidates } = planMilestoneEmails(users, today);

    expect(inactivityCandidates.map(({ user, day }) => [user.userId, day])).toEqual([
      [7, 7],
      [14, 14],
    ]);
  });

  it("trial_nurture と同日に重なるお試しユーザーは、inactivity_reminder の候補にしない", () => {
    const users = [user(1, "trial", signedUp(7)), user(2, "trial", signedUp(14))];

    const { trialNurture, inactivityCandidates } = planMilestoneEmails(users, today);

    expect(trialNurture).toHaveLength(2);
    expect(inactivityCandidates).toHaveLength(0);
  });

  it("active ユーザーには trial_nurture を送らない", () => {
    const { trialNurture } = planMilestoneEmails([user(1, "active", signedUp(2))], today);
    expect(trialNurture).toHaveLength(0);
  });

  it("N 日目を過ぎた日には拾わない（前日の実行が失敗しても翌日に送らない）", () => {
    const users = [user(1, "trial", signedUp(3)), user(2, "active", signedUp(8))];

    const { trialNurture, inactivityCandidates } = planMilestoneEmails(users, today);

    expect(trialNurture).toHaveLength(0);
    expect(inactivityCandidates).toHaveLength(0);
  });
});

const contents: DigestContent[] = [
  { id: 1, title: "A", path: "/learn/1/1/1/1", themeName: "T1", isOpenToTrial: true },
  { id: 2, title: "B", path: "/learn/1/1/1/2", themeName: "T1", isOpenToTrial: false },
  { id: 3, title: "C", path: "/learn/2/2/2/3", themeName: "T2", isOpenToTrial: true },
  { id: 4, title: "D", path: "/learn/2/2/2/4", themeName: "T2", isOpenToTrial: false },
];

describe("次に学ぶコンテンツ", () => {
  it("お試しユーザーはお試し公開のコンテンツだけを対象にする", () => {
    expect(visibleContentsFor(contents, "trial").map((c) => c.id)).toEqual([1, 3]);
    expect(visibleContentsFor(contents, "active").map((c) => c.id)).toEqual([1, 2, 3, 4]);
  });

  it("閲覧できる未完了の先頭と未完了数を返す", () => {
    const { next, remaining } = resolveNextContent(contents, new Set([1, 2]));
    expect(next?.id).toBe(3);
    expect(remaining).toBe(2);
  });

  it("すべて完了していれば next は null", () => {
    const { next, remaining } = resolveNextContent(
      visibleContentsFor(contents, "trial"),
      new Set([1, 3])
    );
    expect(next).toBeNull();
    expect(remaining).toBe(0);
  });

  it("鍵が掛かるコンテンツを含むテーマ名を学習順・重複なしで返す", () => {
    expect(lockedThemeNames(contents)).toEqual(["T1", "T2"]);
  });
});

describe("isWeeklyDigestTarget", () => {
  it("直近1週間の完了・提出がある、または未完了が残っていれば対象", () => {
    expect(
      isWeeklyDigestTarget({ completedLastWeek: 1, submittedLastWeek: 0, remainingContents: 0 })
    ).toBe(true);
    expect(
      isWeeklyDigestTarget({ completedLastWeek: 0, submittedLastWeek: 1, remainingContents: 0 })
    ).toBe(true);
    expect(
      isWeeklyDigestTarget({ completedLastWeek: 0, submittedLastWeek: 0, remainingContents: 3 })
    ).toBe(true);
  });

  it("活動も未完了も無ければ対象外", () => {
    expect(
      isWeeklyDigestTarget({ completedLastWeek: 0, submittedLastWeek: 0, remainingContents: 0 })
    ).toBe(false);
  });
});
