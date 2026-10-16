import type { PushKind } from "@/app/constants/notifications";
import { EMAIL_KIND } from "@/app/constants/notifications";
import { isAnnouncementTarget } from "@/app/lib/announcement-target";
import {
  type DigestContent,
  type DigestUser,
  planMilestoneEmails,
  visibleContentsFor,
} from "@/app/lib/email-digest";
import { isLearnerRole } from "@/app/services/auth/permissions";

export type PushPayload = { title: string; body: string; url: string };

export type DigestPushTarget = {
  userId: number;
  kind: PushKind;
  referenceKey: string;
  payload: PushPayload;
};

type PushAnnouncement = {
  id: number;
  title: string;
  target_statuses: string[];
  target_membership_types: string[] | null;
  /** Null while the email bulk send is still open. */
  emailSentAt: string | null;
};

/**
 * Pending bulk-send rows, plus rows this run just marked sent (`email_sent_at` >= `sentSince`).
 * An earlier completion is history: queueing it notifies every current target once, including
 * people who subscribed before this cron.
 */
export function isAnnouncementPushCurrent(emailSentAt: string | null, sentSince: string): boolean {
  if (emailSentAt === null) {
    return true;
  }
  const completedAt = Date.parse(emailSentAt);
  const since = Date.parse(sentSince);
  return Number.isFinite(completedAt) && Number.isFinite(since) && completedAt >= since;
}

const TRIAL_STAGE_DAYS = [14, 7, 5, 2] as const;

const TRIAL_PUSH_BODY: Record<(typeof TRIAL_STAGE_DAYS)[number], string> = {
  2: "演習を提出して、AIレビューを受けてみましょう",
  5: "AIレビューを確認して、次の演習に進みましょう",
  7: "本登録すると、ロック中のテーマも学べます",
  14: "お試しの案内はこれが最後です。本登録で続きを学べます",
};

function trialStage(day: number): (typeof TRIAL_STAGE_DAYS)[number] {
  return TRIAL_STAGE_DAYS.find((stage) => day >= stage) ?? 2;
}

function trialBody(day: number, isFinal: boolean): string {
  if (isFinal) {
    return TRIAL_PUSH_BODY[14];
  }
  return TRIAL_PUSH_BODY[trialStage(day)];
}

/**
 * Push targets for one digest run. Milestone days and announcement membership use the same
 * helpers as the email queue. Callers pass every active/trial user, including people who
 * unsubscribed from email: that flag is an email preference, not a push preference.
 * Null day lists and `announcements: []` mean that channel is off (`push_enabled` false).
 */
export function selectDigestPushTargets(input: {
  users: DigestUser[];
  today: string;
  trialDays: readonly number[] | null;
  inactivityDays: readonly number[] | null;
  activeUserIds: ReadonlySet<number>;
  contents: DigestContent[];
  announcements: PushAnnouncement[];
  /** Instant captured before this run records `email_sent_at`. */
  announcementSentSince: string;
  finalTrialDay: number;
}): DigestPushTarget[] {
  const learners = input.users.filter((user) => isLearnerRole(user.role));
  const planned = planMilestoneEmails(learners, input.today, {
    trialNurture: input.trialDays,
    inactivityReminder: input.inactivityDays,
  });

  const targets: DigestPushTarget[] = [];

  for (const { user, day } of planned.trialNurture) {
    targets.push({
      userId: user.userId,
      kind: EMAIL_KIND.TRIAL_NURTURE,
      referenceKey: `day${day}`,
      payload: {
        title: "お試し期間の案内",
        body: trialBody(day, day === input.finalTrialDay),
        url: "/learn",
      },
    });
  }

  for (const { user, day } of planned.inactivityCandidates) {
    if (input.activeUserIds.has(user.userId)) {
      continue;
    }
    const first = visibleContentsFor(input.contents, user.status)[0] ?? null;
    targets.push({
      userId: user.userId,
      kind: EMAIL_KIND.INACTIVITY_REMINDER,
      referenceKey: `day${day}`,
      payload: {
        title: "最初のコンテンツから始めてみませんか",
        body: first ? first.title : "最初の1本から始めてみましょう",
        url: first ? first.path : "/learn",
      },
    });
  }

  for (const announcement of input.announcements) {
    if (!isAnnouncementPushCurrent(announcement.emailSentAt, input.announcementSentSince)) {
      continue;
    }
    for (const user of input.users) {
      if (
        !isAnnouncementTarget(announcement, {
          status: user.status,
          membershipType: user.membershipType,
        })
      ) {
        continue;
      }
      targets.push({
        userId: user.userId,
        kind: EMAIL_KIND.ANNOUNCEMENT,
        referenceKey: String(announcement.id),
        payload: {
          title: announcement.title,
          body: "お知らせが届きました",
          url: `/announcements/${announcement.id}`,
        },
      });
    }
  }

  return targets;
}
