import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import { EMAIL_SERVICE_NAME_MAX, EMAIL_SERVICE_SUBTITLE_MAX } from "@/app/constants/notifications";
import { EMAIL_TEMPLATE_DEFINITIONS } from "@/app/lib/email-template";
import { fetchEmailTemplatesForAdmin } from "@/app/services/api/email-templates-server";
import { Badge } from "@/components/ui/badge";
import { BrandingForm } from "./components/branding-form";

function formatUpdated(
  updatedAt: string,
  updatedBy: number | null,
  editorNames: Record<number, string>
) {
  const who = updatedBy !== null ? (editorNames[updatedBy] ?? "不明") : "不明";
  return `${new Date(updatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（${who}）`;
}

export default async function AdminEmailTemplatesPage() {
  const { data, error } = await fetchEmailTemplatesForAdmin();

  return (
    <div className="space-y-8">
      <PageTitle
        title="メール文面の編集"
        breadcrumbs={[
          { label: "メール通知", href: "/admin/emails" },
          { label: "メール文面の編集" },
        ]}
        description="受講生に届くメールの件名・本文を編集します。宛名・ボタン・自動送信の定型文・配信停止リンクは編集できません。"
      />

      {error || !data ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">サービス名</h2>
            <p className="text-sm text-muted-foreground">
              差出人名・件名の先頭（【サービス名】）・本文の見出し・フッターに使われます。
            </p>
            <BrandingForm
              serviceName={data.branding.serviceName}
              serviceSubtitle={data.branding.serviceSubtitle ?? ""}
              nameMax={EMAIL_SERVICE_NAME_MAX}
              subtitleMax={EMAIL_SERVICE_SUBTITLE_MAX}
              updatedLabel={
                data.branding.updatedAt
                  ? formatUpdated(
                      data.branding.updatedAt,
                      data.branding.updatedBy,
                      data.editorNames
                    )
                  : null
              }
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">テンプレート一覧</h2>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">種別</th>
                    <th className="px-4 py-2 font-medium">件名</th>
                    <th className="px-4 py-2 font-medium">状態</th>
                    <th className="px-4 py-2 font-medium">最終更新</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.templates.map(({ key, stored }) => (
                    <tr key={key} className="border-t align-top">
                      <td className="px-4 py-3 font-medium">
                        {EMAIL_TEMPLATE_DEFINITIONS[key].label}
                      </td>
                      <td className="px-4 py-3">
                        {stored?.subject ?? EMAIL_TEMPLATE_DEFINITIONS[key].subject}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={stored ? "default" : "outline"}>
                          {stored ? "編集済み" : "既定値"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {stored
                          ? formatUpdated(stored.updatedAt, stored.updatedBy, data.editorNames)
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/emails/templates/${encodeURIComponent(key)}`}
                          className="text-primary underline underline-offset-2"
                        >
                          編集
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
