import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/notifications/push", () => ({
  sendPushToUser: vi.fn().mockResolvedValue("sent"),
}));

import {
  EMAIL_KINDS,
  INACTIVITY_REMINDER_DAYS,
  TRIAL_NURTURE_DAYS,
} from "@/app/constants/notifications";
import { planMilestoneEmails } from "@/app/lib/email-digest";
import { sendPushToUser } from "@/app/services/notifications/push";
import { deliverDigestPushes } from "@/app/services/notifications/push-digest";
import {
  createMockSupabaseClient,
  createQueryBuilder,
  type QueryResult,
} from "../../helpers/supabase-mock";

type TaggedBuilder = ReturnType<typeof createQueryBuilder> & { table: string };

const today = "2026-10-08";

function kindRows(push: Partial<Record<string, boolean>> = {}) {
  return EMAIL_KINDS.map((kind) => ({
    kind,
    enabled: true,
    push_enabled: push[kind] === true,
    send_days:
      kind === "inactivity_reminder"
        ? [...INACTIVITY_REMINDER_DAYS]
        : kind === "trial_nurture"
          ? [...TRIAL_NURTURE_DAYS]
          : null,
    send_weekday: kind === "weekly_digest" ? 1 : null,
    updated_at: "2026-10-01T00:00:00.000Z",
    updated_by: null,
  }));
}

const settingsRow = {
  sending_enabled: false,
  sending_updated_at: null,
  sending_updated_by: null,
  digest_daily_limit: 80,
  updated_at: "2026-10-01T00:00:00.000Z",
  updated_by: null,
};

const inactiveUser = {
  id: 7,
  email: null,
  display_name: "未学習",
  status: "active",
  membership_type: "community",
  role: "member",
  created_at: "2026-10-01T00:00:00.000Z",
  email_opt_out_at: "2026-09-01T00:00:00.000Z",
};

function clientWith(tables: Record<string, QueryResult | QueryResult[]>) {
  const builders: TaggedBuilder[] = [];
  const client = createMockSupabaseClient({ tableResults: tables });
  const original = client.from.getMockImplementation();
  client.from.mockImplementation((table: string) => {
    const builder = original?.(table) ?? createQueryBuilder({ data: null, error: null });
    const tagged = Object.assign(builder, { table }) as TaggedBuilder;
    builders.push(tagged);
    return tagged;
  });
  return { client, builders };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:ops@example.com");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deliverDigestPushes", () => {
  it("push_enabled がすべて false なら送らず、ユーザー抽出もしない", async () => {
    const { client, builders } = clientWith({
      email_kind_settings: { data: kindRows(), error: null },
      email_settings: { data: settingsRow, error: null },
    });

    await deliverDigestPushes(client as never, today, () => 10);

    expect(sendPushToUser).not.toHaveBeenCalled();
    expect(builders.map((builder) => builder.table)).not.toContain("users");
  });

  it("メールの全体スイッチがオフでも、同じ日数の未学習ユーザーへ送る", async () => {
    const { client, builders } = clientWith({
      email_kind_settings: {
        data: kindRows({ inactivity_reminder: true }),
        error: null,
      },
      email_settings: { data: settingsRow, error: null },
      users: [
        { data: [inactiveUser], error: null },
        { data: [], error: null },
      ],
      user_progress: { data: [], error: null },
      submissions: { data: [], error: null },
      learning_themes: { data: [], error: null },
    });

    await deliverDigestPushes(client as never, today, () => 10);

    const planned = planMilestoneEmails(
      [
        {
          userId: inactiveUser.id,
          email: "",
          displayName: inactiveUser.display_name,
          status: "active",
          membershipType: "community",
          role: "member",
          createdAt: inactiveUser.created_at,
        },
      ],
      today,
      { trialNurture: null, inactivityReminder: [...INACTIVITY_REMINDER_DAYS] }
    );
    expect(sendPushToUser).toHaveBeenCalledTimes(planned.inactivityCandidates.length);
    expect(sendPushToUser).toHaveBeenCalledWith(
      inactiveUser.id,
      "inactivity_reminder",
      "day7",
      expect.objectContaining({ url: "/learn" }),
      expect.anything()
    );
    const usersQuery = builders.find((builder) => builder.table === "users");
    expect(usersQuery?.is).not.toHaveBeenCalledWith("email_opt_out_at", null);
    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).toContain("[Web Push] 定期配信");
  });

  it("お知らせは send_email の対象だけを、メール完了・配信停止と無関係に送る", async () => {
    const { client, builders } = clientWith({
      email_kind_settings: { data: kindRows({ announcement: true }), error: null },
      email_settings: { data: settingsRow, error: null },
      users: [
        {
          data: [
            { ...inactiveUser, id: 3, status: "active", role: "admin" },
            { ...inactiveUser, id: 4, status: "trial", role: "member", membership_type: null },
          ],
          error: null,
        },
        { data: [], error: null },
      ],
      announcements: {
        data: [
          {
            id: 8,
            title: "集会",
            target_statuses: ["active"],
            target_membership_types: null,
            email_sent_at: "2026-10-08T00:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    await deliverDigestPushes(client as never, today, () => 20);

    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).toHaveBeenCalledWith(
      3,
      "announcement",
      "8",
      expect.objectContaining({ title: "集会", url: "/announcements/8" }),
      expect.anything()
    );
    const announcementQuery = builders.find((builder) => builder.table === "announcements");
    expect(announcementQuery?.eq).toHaveBeenCalledWith("send_email", true);
    expect(announcementQuery?.is).not.toHaveBeenCalledWith("email_sent_at", null);
  });

  it("活動行が1000件を超えても、2ページ目の受講生には未学習リマインドを送らない", async () => {
    const firstPage = Array.from({ length: 1000 }, () => ({ user_id: 999 }));
    const { client, builders } = clientWith({
      email_kind_settings: {
        data: kindRows({ inactivity_reminder: true }),
        error: null,
      },
      email_settings: { data: settingsRow, error: null },
      users: [
        { data: [inactiveUser], error: null },
        { data: [], error: null },
      ],
      user_progress: [
        { data: firstPage, error: null },
        { data: [{ user_id: inactiveUser.id }], error: null },
        { data: [], error: null },
      ],
      submissions: { data: [], error: null },
      learning_themes: { data: [], error: null },
    });

    await deliverDigestPushes(client as never, today, () => 10);

    expect(sendPushToUser).not.toHaveBeenCalled();
    const progressQueries = builders.filter((builder) => builder.table === "user_progress");
    expect(progressQueries[0]?.range).toHaveBeenCalledWith(0, 999);
    expect(progressQueries[1]?.range).toHaveBeenCalledWith(1000, 1999);
  });

  it("抽出に失敗しても例外を外に出さない", async () => {
    const client = {
      from: () => {
        throw new Error("db down");
      },
    };

    await expect(deliverDigestPushes(client as never, today, () => 1)).resolves.toBeUndefined();
  });

  it("VAPID が未設定なら何もしない", async () => {
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "");
    const { client } = clientWith({});

    await deliverDigestPushes(client as never, today, () => 1);

    expect(client.from).not.toHaveBeenCalled();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});
