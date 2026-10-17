import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import {
  NOTIFICATION_EMAIL_RESULT,
  NOTIFICATION_EMAIL_RESULT_VALUES,
  type NotificationEmailResult,
} from "@/app/constants/settings";
import { USER_ROLE } from "@/app/constants/user";
import { fetchNotificationEmailState } from "@/app/services/api/notification-email-server";
import { fetchUserEmailOptOutAt } from "@/app/services/api/user-email-server";
import { fetchUserDisplayName } from "@/app/services/api/user-profile-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SettingsTiles } from "./SettingsTiles";

const NOTIFICATION_EMAIL_RESULT_MESSAGES: Record<
  NotificationEmailResult,
  { variant: "default" | "destructive"; text: string }
> = {
  [NOTIFICATION_EMAIL_RESULT.CONFIRMED]: {
    variant: "default",
    text: "通知の送り先を変更しました。以後のメールは新しいアドレスに届きます。",
  },
  [NOTIFICATION_EMAIL_RESULT.EXPIRED]: {
    variant: "destructive",
    text: "確認リンクの有効期限が切れています。設定からもう一度お試しください。",
  },
  [NOTIFICATION_EMAIL_RESULT.INVALID]: {
    variant: "destructive",
    text: "確認リンクが正しくないか、すでに使われています。設定からもう一度お試しください。",
  },
  [NOTIFICATION_EMAIL_RESULT.ERROR]: {
    variant: "destructive",
    text: "通知の送り先を変更できませんでした。時間をおいて再度お試しください。",
  },
};

function parseNotificationEmailResult(
  value: string | string[] | undefined
): NotificationEmailResult | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return null;
  }
  return NOTIFICATION_EMAIL_RESULT_VALUES.includes(raw as NotificationEmailResult)
    ? (raw as NotificationEmailResult)
    : null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notification_email?: string | string[] }>;
}) {
  const { userId, userRole, membershipType, userStatus } = await getServerAuth();

  if (!userId) {
    redirect("/login");
  }

  const notificationEmailResult = parseNotificationEmailResult(
    (await searchParams).notification_email
  );

  const [
    { data: emailOptOutAt, error },
    { data: displayName, error: profileError },
    { data: notificationEmail, error: notificationError },
  ] = await Promise.all([
    fetchUserEmailOptOutAt(userId),
    fetchUserDisplayName(userId),
    fetchNotificationEmailState(userId),
  ]);
  // Promotional mail goes to role = member only (docs/specification.md 10.7).
  const isMailTarget = userRole === USER_ROLE.MEMBER;
  const resultBanner = notificationEmailResult
    ? NOTIFICATION_EMAIL_RESULT_MESSAGES[notificationEmailResult]
    : null;

  return (
    <div className="max-w-5xl mx-auto">
      <PageTitle title="設定" description="プロフィール・通知・プランを確認・変更できます" />

      {resultBanner && (
        <Alert variant={resultBanner.variant} className="mb-6" role="status">
          <AlertDescription>{resultBanner.text}</AlertDescription>
        </Alert>
      )}

      <SettingsTiles
        displayName={displayName}
        profileError={Boolean(profileError) || displayName === null}
        notification={notificationEmail}
        notificationError={Boolean(notificationError) || !notificationEmail}
        emailOptOutAt={emailOptOutAt}
        emailOptOutError={Boolean(error)}
        isMailTarget={isMailTarget}
        membershipType={membershipType}
        userStatus={userStatus}
      />
    </div>
  );
}
