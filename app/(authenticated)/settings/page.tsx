import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { PRIVACY_URL } from "@/app/constants/legal";
import { USER_ROLE } from "@/app/constants/user";
import { fetchUserEmailOptOutAt } from "@/app/services/api/user-email-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { EmailPreferencesForm } from "./EmailPreferencesForm";

export default async function SettingsPage() {
  const { userId, userRole } = await getServerAuth();

  if (!userId) {
    redirect("/login");
  }

  const { data: emailOptOutAt, error } = await fetchUserEmailOptOutAt(userId);
  // Promotional mail goes to role = member only (docs/specification.md 10.7).
  const isMailTarget = userRole === USER_ROLE.MEMBER;

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle title="設定" description="案内メールの配信を確認・変更できます" />

      <Card>
        <CardContent className="space-y-6 p-6">
          <h2 className="text-lg font-semibold">案内メールの配信</h2>

          {error ? (
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
        </CardContent>
      </Card>
    </div>
  );
}
