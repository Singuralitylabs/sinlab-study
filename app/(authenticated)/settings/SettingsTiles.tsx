"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { PRIVACY_URL } from "@/app/constants/legal";
import { PLAN_PAGE_TITLE } from "@/app/constants/stripe";
import { MEMBERSHIP_TYPES, USER_MEMBERSHIP_LABELS, USER_STATUS } from "@/app/constants/user";
import type { MembershipType, UserStatusType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EmailPreferencesForm } from "./EmailPreferencesForm";
import { NotificationEmailForm } from "./NotificationEmailForm";
import { ProfileForm } from "./ProfileForm";

export function currentPlanLabel(
  membershipType: MembershipType | null | undefined,
  userStatus: UserStatusType | null | undefined
): string {
  if (membershipType && MEMBERSHIP_TYPES.includes(membershipType)) {
    return USER_MEMBERSHIP_LABELS[membershipType];
  }
  if (userStatus === USER_STATUS.TRIAL) {
    return "お試しユーザー";
  }
  return "未設定";
}

type NotificationState = {
  loginEmail: string;
  notificationEmail: string | null;
  pendingEmail: string | null;
  pendingExpiresAt: string | null;
};

type SettingsTilesProps = {
  displayName: string | null;
  profileError: boolean;
  notification: NotificationState | null;
  notificationError: boolean;
  emailOptOutAt: string | null;
  emailOptOutError: boolean;
  isMailTarget: boolean;
  membershipType: MembershipType | null | undefined;
  userStatus: UserStatusType | null | undefined;
};

function TileShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex h-full flex-col gap-3 p-5">{children}</CardContent>
    </Card>
  );
}

function TileHeader({ title, openLabel }: { title: string; openLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {openLabel ? (
        <ChevronRight
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
        />
      ) : null}
    </div>
  );
}

export function SettingsTiles({
  displayName,
  profileError,
  notification,
  notificationError,
  emailOptOutAt,
  emailOptOutError,
  isMailTarget,
  membershipType,
  userStatus,
}: SettingsTilesProps) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  const destination = notification
    ? (notification.notificationEmail ?? notification.loginEmail)
    : null;
  const pendingActive = Boolean(
    notification?.pendingEmail &&
      notification.pendingExpiresAt &&
      new Date(notification.pendingExpiresAt).getTime() > Date.now()
  );
  const planLabel = currentPlanLabel(membershipType, userStatus);

  const refreshOnClose = (open: boolean, setOpen: (next: boolean) => void) => {
    setOpen(open);
    if (!open) {
      router.refresh();
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Dialog open={profileOpen} onOpenChange={(open) => refreshOnClose(open, setProfileOpen)}>
        <TileShell className="group">
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="プロフィールを編集"
              className="flex h-full w-full flex-col gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            >
              <TileHeader title="プロフィール" openLabel="編集" />
              {profileError || displayName === null ? (
                <p className="text-sm text-destructive">表示名を取得できませんでした</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">表示名</p>
                  <p className="text-sm font-medium break-words">{displayName || "（未設定）"}</p>
                </div>
              )}
            </button>
          </DialogTrigger>
        </TileShell>
        <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>プロフィール</DialogTitle>
            <DialogDescription>表示名を変更できます。修了証にも使われます。</DialogDescription>
          </DialogHeader>
          {profileError || displayName === null ? (
            <Alert variant="destructive">
              <AlertDescription>
                表示名を取得できませんでした。時間をおいて再度お試しください。
              </AlertDescription>
            </Alert>
          ) : (
            <ProfileForm initialDisplayName={displayName} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={notificationOpen}
        onOpenChange={(open) => refreshOnClose(open, setNotificationOpen)}
      >
        <TileShell className="group">
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="通知設定を編集"
              className="flex h-full w-full flex-col gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            >
              <TileHeader title="通知" openLabel="編集" />
              {notificationError || !notification ? (
                <p className="text-sm text-destructive">通知設定を取得できませんでした</p>
              ) : (
                <div className="space-y-2 min-w-0">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">送り先</p>
                    <p className="text-sm font-medium break-all">{destination}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={emailOptOutAt ? "secondary" : "default"}>
                      {emailOptOutError
                        ? "配信状態を取得できません"
                        : emailOptOutAt
                          ? "案内メール: 停止中"
                          : "案内メール: 配信中"}
                    </Badge>
                    {pendingActive && <Badge variant="outline">確認待ち</Badge>}
                  </div>
                  {pendingActive && notification.pendingEmail && (
                    <p className="text-xs text-muted-foreground break-all">
                      確認待ち: {notification.pendingEmail}
                    </p>
                  )}
                  {!isMailTarget && (
                    <p className="text-xs text-muted-foreground">
                      管理者・メンテナーには案内メールは送信されません
                    </p>
                  )}
                </div>
              )}
            </button>
          </DialogTrigger>
        </TileShell>
        <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>通知</DialogTitle>
            <DialogDescription>通知の送り先と、案内メールの配信を設定できます。</DialogDescription>
          </DialogHeader>
          <div className="space-y-8">
            <section className="space-y-4" aria-labelledby="settings-notification-heading">
              <h3 id="settings-notification-heading" className="text-sm font-semibold">
                通知の送り先
              </h3>
              {notificationError || !notification ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    通知の送り先を取得できませんでした。時間をおいて再度お試しください。
                  </AlertDescription>
                </Alert>
              ) : (
                <NotificationEmailForm
                  loginEmail={notification.loginEmail}
                  notificationEmail={notification.notificationEmail}
                  pendingEmail={notification.pendingEmail}
                  pendingExpiresAt={notification.pendingExpiresAt}
                />
              )}
            </section>

            <section className="space-y-4 border-t pt-6" aria-labelledby="settings-email-heading">
              <h3 id="settings-email-heading" className="text-sm font-semibold">
                案内メールの配信
              </h3>
              {emailOptOutError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    配信設定を取得できませんでした。時間をおいて再度お試しください。
                  </AlertDescription>
                </Alert>
              ) : (
                <EmailPreferencesForm initialEmailOptOutAt={emailOptOutAt} />
              )}

              {!isMailTarget && (
                <p className="text-sm text-muted-foreground">
                  管理者・メンテナーのアカウントには、案内メールは送信されません。
                </p>
              )}

              <div className="space-y-2 text-sm">
                <p className="font-medium">停止できるメール（案内メール）</p>
                <p className="text-muted-foreground">
                  学習状況のお知らせ・リマインド、本サービスの機能および有料プランのご案内、本サービスに関するお知らせのメール。
                </p>
                <p className="font-medium">停止できないメール</p>
                <p className="text-muted-foreground">
                  アカウントの登録・承認、契約、解約等の手続に関する通知は、本サービスの提供に必要なため停止できません。ただし、これらの通知に案内メールに当たる内容を含めるときは、配信停止の方法を記載します。
                </p>
              </div>

              <p className="text-sm">
                詳しくは
                <a
                  href={PRIVACY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  プライバシーポリシー
                </a>
                をご確認ください。
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <TileShell className="group">
        <Link
          href="/upgrade"
          aria-label={`${PLAN_PAGE_TITLE}（現在のプラン: ${planLabel}）`}
          className="flex h-full w-full flex-col gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <TileHeader title="プラン" openLabel="開く" />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">現在のプラン</p>
            <p className="text-sm font-medium">{planLabel}</p>
          </div>
          <p className="mt-auto text-xs text-muted-foreground">{PLAN_PAGE_TITLE}</p>
        </Link>
      </TileShell>
    </div>
  );
}
