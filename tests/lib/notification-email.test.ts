import { describe, expect, it } from "vitest";
import {
  EMAIL_KINDS,
  NOTIFICATION_EMAIL_CONFIRM_LIMIT,
  NOTIFICATION_EMAIL_LOG_KIND,
  NOTIFICATION_EMAIL_TOKEN_TTL_LABEL,
  NOTIFICATION_EMAIL_TOKEN_TTL_MS,
  PROMOTIONAL_EMAIL_KINDS,
} from "@/app/constants/notifications";
import { parseNotificationEmail, resolveNotificationEmail } from "@/app/lib/notification-email";

describe("resolveNotificationEmail", () => {
  it("notification_email があればそれを返し、無ければログイン用を返す", () => {
    expect(
      resolveNotificationEmail({
        email: "login@example.com",
        notification_email: "notify@example.com",
      })
    ).toBe("notify@example.com");
    expect(resolveNotificationEmail({ email: "login@example.com", notification_email: null })).toBe(
      "login@example.com"
    );
    expect(resolveNotificationEmail({ email: "login@example.com" })).toBe("login@example.com");
  });

  it("空白だけの notification_email はログイン用に戻す", () => {
    expect(
      resolveNotificationEmail({ email: " login@example.com ", notification_email: "  " })
    ).toBe("login@example.com");
  });
});

describe("parseNotificationEmail", () => {
  it("前後の空白を除いて小文字にする", () => {
    expect(parseNotificationEmail("  Notify@Example.com ")).toEqual({
      ok: true,
      email: "notify@example.com",
    });
  });

  it("空・形式不正は入力をメッセージに含めない", () => {
    const empty = parseNotificationEmail("  ");
    const broken = parseNotificationEmail("not-an-email");
    expect(empty.ok).toBe(false);
    expect(broken.ok).toBe(false);
    if (!empty.ok) expect(empty.message).not.toContain("@");
    if (!broken.ok) expect(broken.message).not.toContain("not-an-email");
  });
});

describe("確認メールの種別", () => {
  it("EMAIL_KIND と案内系の上限対象に入れない", () => {
    expect(EMAIL_KINDS).not.toContain(NOTIFICATION_EMAIL_LOG_KIND.CONFIRM);
    expect(EMAIL_KINDS).not.toContain(NOTIFICATION_EMAIL_LOG_KIND.CHANGED);
    expect(PROMOTIONAL_EMAIL_KINDS).not.toContain(NOTIFICATION_EMAIL_LOG_KIND.CONFIRM);
    expect(PROMOTIONAL_EMAIL_KINDS).not.toContain(NOTIFICATION_EMAIL_LOG_KIND.CHANGED);
  });

  it("期限の表示は定数から導く", () => {
    expect(NOTIFICATION_EMAIL_TOKEN_TTL_LABEL).toBe(
      `${NOTIFICATION_EMAIL_TOKEN_TTL_MS / (60 * 60 * 1000)}時間`
    );
    expect(NOTIFICATION_EMAIL_CONFIRM_LIMIT).toBe(5);
  });
});
