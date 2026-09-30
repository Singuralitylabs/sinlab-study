import { USER_STATUS } from "@/app/constants/user";
import type { UserStatusType } from "@/app/types";

/**
 * Pure functions deciding periodic mail (GET /api/cron/email-digest) targets; no DB or sending
 * dependency. All dates are JST calendar dates (YYYY-MM-DD). Japan has no DST, so UTC + 9h gives
 * the JST calendar date.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toJstDateString(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function dateStringToUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(dateStringToUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dateStringToUtcMs(to) - dateStringToUtcMs(from)) / DAY_MS);
}

/**
 * Most recent send day (on or before the date) for the configured send weekday (0 = Sunday ...
 * 6 = Saturday). It is the weekly digest's reference_key; the "last week" it reports is the 7 days
 * ending the day before it.
 */
export function cycleStartOf(date: string, sendWeekday: number): string {
  const dayOfWeek = new Date(dateStringToUtcMs(date)).getUTCDay();
  return addDays(date, -((dayOfWeek - sendWeekday + 7) % 7));
}

export function jstStartOfDayIso(date: string): string {
  return new Date(dateStringToUtcMs(date) - JST_OFFSET_MS).toISOString();
}

/**
 * Days since sign-up: users.created_at rounded to the JST calendar date, with the sign-up date as
 * day 0 (e.g. a user who signs up 10/1 23:30 JST has day 7 on 10/8).
 */
export function daysSinceSignup(createdAt: string, today: string): number {
  return daysBetween(toJstDateString(new Date(createdAt)), today);
}

/**
 * Whether the sign-up date makes the user eligible for the weekly digest: only users who could use
 * all of last week (Mon-Sun), i.e. signed up on or before last week's Monday (JST). Avoids sending
 * "no activity last week" to someone who signed up mid-week.
 */
export function coversPreviousWeek(createdAt: string, weekStart: string): boolean {
  return daysSinceSignup(createdAt, weekStart) >= 7;
}

export type DigestUser = {
  userId: number;
  email: string;
  displayName: string;
  status: UserStatusType;
  membershipType: string | null;
  createdAt: string;
};

export type MilestoneEmail = { user: DigestUser; day: number };

/**
 * Decides targets for the two "N days since sign-up" mails. trial_nurture: status = trial and today
 * is one of `trialNurtureDays`. inactivity_reminder: today is one of `inactivityReminderDays` (the
 * caller checks for activity via user_progress / submissions); users who get trial_nurture the same
 * day are excluded. A disabled kind is passed as null and never targeted. Days missed because the
 * daily run failed or hit the cap aren't picked up later (only exactly day N is checked).
 */
export function planMilestoneEmails(
  users: DigestUser[],
  today: string,
  days: { trialNurture: readonly number[] | null; inactivityReminder: readonly number[] | null }
): {
  trialNurture: MilestoneEmail[];
  inactivityCandidates: MilestoneEmail[];
} {
  const trialNurture: MilestoneEmail[] = [];
  const inactivityCandidates: MilestoneEmail[] = [];

  for (const user of users) {
    const day = daysSinceSignup(user.createdAt, today);
    if (user.status === USER_STATUS.TRIAL && days.trialNurture?.includes(day)) {
      trialNurture.push({ user, day });
      continue;
    }
    if (days.inactivityReminder?.includes(day)) {
      inactivityCandidates.push({ user, day });
    }
  }

  return { trialNurture, inactivityCandidates };
}

export type DigestContent = {
  id: number;
  title: string;
  path: string;
  themeName: string;
  isOpenToTrial: boolean;
};

export function visibleContentsFor(
  contents: DigestContent[],
  status: UserStatusType
): DigestContent[] {
  return status === USER_STATUS.TRIAL ? contents.filter((c) => c.isOpenToTrial) : contents;
}

export function resolveNextContent(
  visibleContents: DigestContent[],
  completedContentIds: ReadonlySet<number>
): { next: DigestContent | null; remaining: number } {
  const incomplete = visibleContents.filter((c) => !completedContentIds.has(c.id));
  return { next: incomplete[0] ?? null, remaining: incomplete.length };
}

/**
 * Send the weekly digest to users with at least one completion or submission in the last week, or
 * who still have visible incomplete content.
 */
export function isWeeklyDigestTarget(params: {
  completedLastWeek: number;
  submittedLastWeek: number;
  remainingContents: number;
}): boolean {
  return (
    params.completedLastWeek > 0 || params.submittedLastWeek > 0 || params.remainingContents > 0
  );
}

export function lockedThemeNames(contents: DigestContent[]): string[] {
  return [...new Set(contents.filter((c) => !c.isOpenToTrial).map((c) => c.themeName))];
}
