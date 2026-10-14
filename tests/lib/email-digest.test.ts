import { describe, expect, it } from "vitest";
import {
  addDays,
  coversPreviousWeek,
  cycleStartOf,
  type DigestContent,
  type DigestUser,
  daysSinceSignup,
  isBefore,
  isSameOrAfter,
  isWeeklyDigestTarget,
  jstStartOfDayIso,
  lockedThemeNames,
  planMilestoneEmails,
  resolveNextContent,
  toJstDateString,
  visibleContentsFor,
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

describe("cycleStartOf（送信曜日を起点とする週の開始日）", () => {
  it.each([
    ["2026-10-05", 1, "2026-10-05"],
    ["2026-10-06", 1, "2026-10-05"],
    ["2026-10-11", 1, "2026-10-05"],
    ["2026-10-12", 1, "2026-10-12"],
    ["2026-10-05", 3, "2026-09-30"],
    ["2026-10-07", 3, "2026-10-07"],
    ["2026-10-08", 3, "2026-10-07"],
    ["2026-10-11", 0, "2026-10-11"],
    ["2026-10-10", 0, "2026-10-04"],
    ["2026-10-10", 6, "2026-10-10"],
  ])("%s を含む、曜日 %i の送信日は %s", (date, weekday, expected) => {
    expect(cycleStartOf(date, weekday)).toBe(expected);
  });
});

describe("daysSinceSignup", () => {
  it("created_at を JST の暦日に丸め、登録日を 0 日目とする", () => {
    // Signed up at 2026-09-28 23:30 JST.
    const createdAt = "2026-09-28T14:30:00Z";
    expect(daysSinceSignup(createdAt, "2026-09-28")).toBe(0);
    expect(daysSinceSignup(createdAt, "2026-10-05")).toBe(7);
  });

  it("UTC では前日でも JST で翌日になる登録は、JST の日付で数える", () => {
    // Signed up at 2026-09-29 00:30 JST (9/28 in UTC).
    const createdAt = "2026-09-28T15:30:00Z";
    expect(daysSinceSignup(createdAt, "2026-10-05")).toBe(6);
    expect(daysSinceSignup(createdAt, "2026-10-06")).toBe(7);
  });
});

describe("coversPreviousWeek（週次進捗の対象になれる登録日）", () => {
  it("前週の月曜（JST）以前に登録していれば対象、それより後なら対象外", () => {
    expect(coversPreviousWeek("2026-09-28T03:00:00Z", "2026-10-05")).toBe(true);
    expect(coversPreviousWeek("2026-09-20T03:00:00Z", "2026-10-05")).toBe(true);
    expect(coversPreviousWeek("2026-09-29T03:00:00Z", "2026-10-05")).toBe(false);
    expect(coversPreviousWeek("2026-10-04T03:00:00Z", "2026-10-05")).toBe(false);
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
    role: "member",
    createdAt,
  };
}

describe("planMilestoneEmails", () => {
  const today = "2026-10-15";
  const DEFAULT_DAYS = { trialNurture: [2, 5, 7, 14], inactivityReminder: [7, 14] };
  // Back-calculated from a sign-up at noon JST (today - N days).
  const signedUp = (days: number) => `${addDays(today, -days)}T03:00:00Z`;

  it("お試しユーザーは登録から 2・5・7・14 日目に trial_nurture の対象になる", () => {
    const users = [2, 3, 5, 7, 14, 15].map((d) => user(d, "trial", signedUp(d)));

    const { trialNurture } = planMilestoneEmails(users, today, DEFAULT_DAYS);

    expect(trialNurture.map(({ user, day }) => [user.userId, day])).toEqual([
      [2, 2],
      [5, 5],
      [7, 7],
      [14, 14],
    ]);
  });

  it("未学習リマインドの候補は登録から 7・14 日目のユーザー", () => {
    const users = [6, 7, 8, 14].map((d) => user(d, "active", signedUp(d)));

    const { inactivityCandidates } = planMilestoneEmails(users, today, DEFAULT_DAYS);

    expect(inactivityCandidates.map(({ user, day }) => [user.userId, day])).toEqual([
      [7, 7],
      [14, 14],
    ]);
  });

  it("trial_nurture と同日に重なるお試しユーザーは、inactivity_reminder の候補にしない", () => {
    const users = [user(1, "trial", signedUp(7)), user(2, "trial", signedUp(14))];

    const { trialNurture, inactivityCandidates } = planMilestoneEmails(users, today, DEFAULT_DAYS);

    expect(trialNurture).toHaveLength(2);
    expect(inactivityCandidates).toHaveLength(0);
  });

  it("active ユーザーには trial_nurture を送らない", () => {
    const { trialNurture } = planMilestoneEmails(
      [user(1, "active", signedUp(2))],
      today,
      DEFAULT_DAYS
    );
    expect(trialNurture).toHaveLength(0);
  });

  it("N 日目を過ぎた日には拾わない（前日の実行が失敗しても翌日に送らない）", () => {
    const users = [user(1, "trial", signedUp(3)), user(2, "active", signedUp(8))];

    const { trialNurture, inactivityCandidates } = planMilestoneEmails(users, today, DEFAULT_DAYS);

    expect(trialNurture).toHaveLength(0);
    expect(inactivityCandidates).toHaveLength(0);
  });

  it("設定した N 日目が使われる（既定の日は対象外になる）", () => {
    const users = [3, 7, 20].map((d) => user(d, "trial", signedUp(d)));

    const { trialNurture, inactivityCandidates } = planMilestoneEmails(users, today, {
      trialNurture: [3, 20],
      inactivityReminder: [7],
    });

    expect(trialNurture.map(({ user, day }) => [user.userId, day])).toEqual([
      [3, 3],
      [20, 20],
    ]);
    expect(inactivityCandidates.map(({ user }) => user.userId)).toEqual([7]);
  });

  it("null（無効な種別）は対象にしない", () => {
    const users = [user(1, "trial", signedUp(2)), user(2, "active", signedUp(7))];

    expect(
      planMilestoneEmails(users, today, { trialNurture: null, inactivityReminder: [7] })
    ).toMatchObject({ trialNurture: [], inactivityCandidates: [{ day: 7 }] });
    expect(
      planMilestoneEmails(users, today, { trialNurture: [2], inactivityReminder: null })
    ).toMatchObject({ trialNurture: [{ day: 2 }], inactivityCandidates: [] });
  });
});

const contents: DigestContent[] = [
  { id: 1, title: "A", themeId: 1, path: "/learn/1/1/1/1", themeName: "T1", isOpenToTrial: true },
  { id: 2, title: "B", themeId: 1, path: "/learn/1/1/1/2", themeName: "T1", isOpenToTrial: false },
  { id: 3, title: "C", themeId: 2, path: "/learn/2/2/2/3", themeName: "T2", isOpenToTrial: true },
  { id: 4, title: "D", themeId: 2, path: "/learn/2/2/2/4", themeName: "T2", isOpenToTrial: false },
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

  describe("学習中のテーマの中から選ぶ（#308）", () => {
    // Two themes with three contents each; ids 1-3 are T1, 4-6 are T2.
    const themed: DigestContent[] = [1, 2, 3, 4, 5, 6].map((id) => ({
      id,
      title: `C${id}`,
      themeId: id <= 3 ? 1 : 2,
      path: `/learn/${id <= 3 ? 1 : 2}/1/1/${id}`,
      themeName: id <= 3 ? "T1" : "T2",
      isOpenToTrial: true,
    }));

    it("完了が無ければ全体の先頭で、学習中のテーマは空", () => {
      const result = resolveNextContent(themed, new Set());
      expect(result.next?.id).toBe(1);
      expect(result.remaining).toBe(6);
      expect(result.activeThemes).toEqual([]);
    });

    it("学習中が1テーマなら、そのテーマ内の先頭の未完了を選ぶ（別テーマの先頭に飛ばない）", () => {
      const { next, activeThemes } = resolveNextContent(themed, new Set([4]), new Map([[4, 1000]]));
      expect(next?.id).toBe(5);
      expect(activeThemes).toEqual([{ themeName: "T2", completedContents: 1, totalContents: 3 }]);
    });

    it("学習中が複数なら、最近完了があったテーマを選ぶ", () => {
      const completedAt = new Map([
        [1, 5000],
        [4, 9000],
      ]);
      const { next, activeThemes } = resolveNextContent(themed, new Set([1, 4]), completedAt);
      expect(next?.id).toBe(5);
      expect(activeThemes.map((t) => t.themeName)).toEqual(["T2", "T1"]);

      completedAt.set(1, 12000);
      expect(resolveNextContent(themed, new Set([1, 4]), completedAt).next?.id).toBe(2);
    });

    it("最近のテーマを全て完了していれば、次に最近の学習中テーマへ移る", () => {
      const completedAt = new Map([
        [1, 1000],
        [4, 2000],
        [5, 3000],
        [6, 4000],
      ]);
      const { next, activeThemes } = resolveNextContent(themed, new Set([1, 4, 5, 6]), completedAt);
      expect(next?.id).toBe(2);
      // T2 is fully done, so it is "completed", not "active".
      expect(activeThemes.map((t) => t.themeName)).toEqual(["T1"]);
    });

    it("学習中のテーマが無い（全て修了）ときは全体の先頭の未完了に戻る", () => {
      const { next } = resolveNextContent(themed.slice(0, 3), new Set([1, 2, 3]));
      expect(next).toBeNull();
    });

    it("完了時刻が不明でも落ちず、学習順で決める", () => {
      const { next } = resolveNextContent(themed, new Set([1, 4]));
      expect(next?.id).toBe(2);
    });

    it("お試しは分母がお試し公開分なので、お試し範囲を全て完了したテーマは学習中に入らない", () => {
      const trialVisible = visibleContentsFor(contents, "trial");
      const { next, activeThemes } = resolveNextContent(trialVisible, new Set([1]));
      expect(activeThemes).toEqual([]);
      expect(next?.id).toBe(3);
    });
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

describe("isBefore / isSameOrAfter（timestamptz を瞬間として比較する）", () => {
  const cycleStart = "2026-10-05T15:00:00.000Z";

  it.each([
    "2026-10-05T15:00:00+00:00",
    "2026-10-05T15:00:00.000+00:00",
    "2026-10-05T15:00:00.000000+00:00",
    "2026-10-06T00:00:00+09:00",
  ])("同一秒の %s は同時刻として扱う", (value) => {
    expect(isSameOrAfter(value, cycleStart)).toBe(true);
    expect(isBefore(value, cycleStart)).toBe(false);
  });

  it("1 秒前は前、1 秒後は後として扱う", () => {
    expect(isBefore("2026-10-05T14:59:59+00:00", cycleStart)).toBe(true);
    expect(isSameOrAfter("2026-10-05T14:59:59+00:00", cycleStart)).toBe(false);
    expect(isSameOrAfter("2026-10-05T15:00:01.123456+00:00", cycleStart)).toBe(true);
  });
});
