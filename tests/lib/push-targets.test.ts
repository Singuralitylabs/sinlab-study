import { describe, expect, it } from "vitest";
import { EMAIL_KIND } from "@/app/constants/notifications";
import type { DigestUser } from "@/app/lib/email-digest";
import { planMilestoneEmails } from "@/app/lib/email-digest";
import { pushOffer } from "@/app/lib/push-offer";
import { selectDigestPushTargets } from "@/app/lib/push-targets";

const today = "2026-10-08";
const sentSince = "2026-10-16T00:00:00.000Z";

function user(partial: Partial<DigestUser> & Pick<DigestUser, "userId" | "status">): DigestUser {
  return {
    email: "a@example.com",
    displayName: "A",
    membershipType: "community",
    role: "member",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("pushOffer", () => {
  it("環境変数が無ければ購読ボタンを出さない", () => {
    expect(pushOffer({ configured: false, isIos: false, standalone: false })).toBe("hidden");
    expect(pushOffer({ configured: false, isIos: true, standalone: true })).toBe("hidden");
  });

  it("iOS のブラウザでは案内だけ出し、standalone とそれ以外は購読できる", () => {
    expect(pushOffer({ configured: true, isIos: true, standalone: false })).toBe("ios-guide");
    expect(pushOffer({ configured: true, isIos: true, standalone: true })).toBe("subscribe");
    expect(pushOffer({ configured: true, isIos: false, standalone: false })).toBe("subscribe");
  });
});

describe("selectDigestPushTargets", () => {
  const optedOut = user({ userId: 1, status: "active" });
  const activeLearner = user({ userId: 2, status: "active" });
  const trial = user({
    userId: 3,
    status: "trial",
    createdAt: "2026-10-06T00:00:00.000Z",
    membershipType: null,
  });

  it("未学習リマインドの対象はメールと同じ日数判定で、配信停止ユーザーも含む", () => {
    const users = [optedOut, activeLearner, trial];
    const emailUsers = users.filter((item) => item.userId !== optedOut.userId);
    const push = selectDigestPushTargets({
      users,
      today,
      trialDays: [2, 5, 7, 14],
      inactivityDays: [7, 14],
      activeUserIds: new Set([activeLearner.userId]),
      contents: [],
      announcements: [],
      announcementSentSince: sentSince,
      finalTrialDay: 14,
    });
    const pushPlan = planMilestoneEmails(
      users.filter((item) => item.role === "member"),
      today,
      {
        trialNurture: [2, 5, 7, 14],
        inactivityReminder: [7, 14],
      }
    );
    const emailPlan = planMilestoneEmails(emailUsers, today, {
      trialNurture: [2, 5, 7, 14],
      inactivityReminder: [7, 14],
    });

    expect(
      push.filter((item) => item.kind === EMAIL_KIND.INACTIVITY_REMINDER).map((item) => item.userId)
    ).toEqual(
      pushPlan.inactivityCandidates
        .filter((item) => item.user.userId !== activeLearner.userId)
        .map((item) => item.user.userId)
    );
    expect(push.some((item) => item.userId === optedOut.userId)).toBe(true);
    expect(
      emailPlan.inactivityCandidates.some((item) => item.user.userId === optedOut.userId)
    ).toBe(false);
    expect(push.map((item) => item.kind)).not.toContain(EMAIL_KIND.WEEKLY_DIGEST);
  });

  it("push_enabled がオフの種別は対象にしない", () => {
    const targets = selectDigestPushTargets({
      users: [optedOut, trial],
      today,
      trialDays: null,
      inactivityDays: null,
      activeUserIds: new Set(),
      contents: [],
      announcements: [],
      announcementSentSince: sentSince,
      finalTrialDay: 14,
    });
    expect(targets).toEqual([]);
  });

  it("お知らせの対象判定はメールと同じで、ロールは問わない", () => {
    const admin = user({ userId: 9, status: "active", role: "admin" });
    const targets = selectDigestPushTargets({
      users: [admin, trial],
      today,
      trialDays: null,
      inactivityDays: null,
      activeUserIds: new Set(),
      contents: [],
      announcements: [
        {
          id: 4,
          title: "もくもく会",
          target_statuses: ["active"],
          target_membership_types: null,
          emailSentAt: null,
        },
      ],
      announcementSentSince: sentSince,
      finalTrialDay: 14,
    });
    expect(targets).toEqual([
      {
        userId: 9,
        kind: EMAIL_KIND.ANNOUNCEMENT,
        referenceKey: "4",
        payload: {
          title: "もくもく会",
          body: "お知らせが届きました",
          url: "/announcements/4",
        },
      },
    ]);
  });

  it("実行より前にメール完了したお知らせは対象者に積まない", () => {
    const targets = selectDigestPushTargets({
      users: [activeLearner],
      today,
      trialDays: null,
      inactivityDays: null,
      activeUserIds: new Set(),
      contents: [],
      announcements: [
        {
          id: 1,
          title: "過去",
          target_statuses: ["active"],
          target_membership_types: null,
          emailSentAt: "2026-10-01T00:00:00.000Z",
        },
        {
          id: 2,
          title: "この実行",
          target_statuses: ["active"],
          target_membership_types: null,
          emailSentAt: sentSince,
        },
      ],
      announcementSentSince: sentSince,
      finalTrialDay: 14,
    });
    expect(targets.map((item) => item.referenceKey)).toEqual(["2"]);
  });
});
