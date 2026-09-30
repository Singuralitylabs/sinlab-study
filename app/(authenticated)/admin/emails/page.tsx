import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import { EMAIL_DIGEST_DAILY_LIMIT_MAX, EMAIL_KINDS } from "@/app/constants/notifications";
import {
  EMAIL_LOG_STATUSES,
  fetchEmailLogs,
  fetchEmailSettingsForAdmin,
  fetchTodayPromotionalCount,
} from "@/app/services/api/email-settings-server";
import { EmailLogsSection } from "./components/email-logs-section";
import { EmailSettingsForm } from "./components/email-settings-form";

type PageProps = {
  searchParams: Promise<{ kind?: string; status?: string; page?: string }>;
};

export default async function AdminEmailsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const kind = EMAIL_KINDS.find((k) => k === params.kind);
  const status = EMAIL_LOG_STATUSES.find((s) => s === params.status);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const [settings, today, logs] = await Promise.all([
    fetchEmailSettingsForAdmin(),
    fetchTodayPromotionalCount(),
    fetchEmailLogs({ kind, status, page }),
  ]);

  return (
    <div className="space-y-8">
      <PageTitle title="メール通知" />

      <p className="text-sm">
        <Link href="/admin/emails/templates" className="text-primary underline underline-offset-2">
          メール文面（件名・本文・サービス名）を編集する
        </Link>
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">今日の送信状況</h2>
        {today.error || today.count === null ? (
          <p className="text-destructive text-sm">{today.error}</p>
        ) : (
          <p className="text-sm">
            案内系メール（今日・JST）: <span className="font-medium">{today.count}</span> 通
            {settings.data && (
              <>
                {" "}
                / 上限 <span className="font-medium">{settings.data.digestDailyLimit}</span> 通
              </>
            )}
            <span className="ml-2 text-xs text-muted-foreground">
              送信は毎朝の定期実行で行われます（画面からの即時送信はできません）
            </span>
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">種別ごとの設定</h2>
        {settings.error || !settings.data ? (
          <p className="text-destructive text-sm">{settings.error}</p>
        ) : (
          <EmailSettingsForm
            settings={{
              kinds: Object.values(settings.data.kinds),
              digestDailyLimit: settings.data.digestDailyLimit,
              digestUpdatedAt: settings.data.digestUpdatedAt,
              digestUpdatedBy: settings.data.digestUpdatedBy,
              editorNames: settings.data.editorNames,
            }}
            digestDailyLimitMax={EMAIL_DIGEST_DAILY_LIMIT_MAX}
          />
        )}
      </section>

      <EmailLogsSection
        logs={logs.data}
        hasNext={logs.hasNext}
        error={logs.error}
        kind={kind}
        status={status}
        page={page}
      />
    </div>
  );
}
