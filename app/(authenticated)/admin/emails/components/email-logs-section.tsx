import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { EMAIL_KIND_LABELS, EMAIL_KINDS, type EmailKind } from "@/app/constants/notifications";
import type { EmailLogListItem, EmailLogStatus } from "@/app/services/api/email-settings-server";
import { EMAIL_LOG_STATUSES } from "@/app/services/api/email-settings-server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<EmailLogStatus, string> = {
  sent: "送信済み",
  failed: "失敗",
  pending: "未完了",
};

const STATUS_VARIANTS: Record<EmailLogStatus, "default" | "destructive" | "secondary"> = {
  sent: "default",
  failed: "destructive",
  pending: "secondary",
};

const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

function pageHref(kind: EmailKind | undefined, status: EmailLogStatus | undefined, page: number) {
  const query = new URLSearchParams();
  if (kind) query.set("kind", kind);
  if (status) query.set("status", status);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return qs ? `/admin/emails?${qs}` : "/admin/emails";
}

export function EmailLogsSection({
  logs,
  hasNext,
  error,
  kind,
  status,
  page,
}: {
  logs: EmailLogListItem[] | null;
  hasNext: boolean;
  error: string | null;
  kind: EmailKind | undefined;
  status: EmailLogStatus | undefined;
  page: number;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">送信履歴</h2>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <select name="kind" defaultValue={kind ?? ""} className={SELECT_CLASS} aria-label="種別">
          <option value="">すべての種別</option>
          {EMAIL_KINDS.map((k) => (
            <option key={k} value={k}>
              {EMAIL_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className={SELECT_CLASS}
          aria-label="状態"
        >
          <option value="">すべての状態</option>
          {EMAIL_LOG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          絞り込む
        </Button>
      </form>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {logs && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {["日時", "種別", "宛先", "reference_key", "状態", "エラー"].map((head) => (
                  <th key={head} scope="col" className="text-left px-4 py-3 font-medium">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    該当する送信履歴がありません
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-b-0 align-top">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {EMAIL_KIND_LABELS[log.kind as EmailKind] ?? log.kind}
                    </td>
                    <td className="px-4 py-3">
                      {log.user ? (
                        <>
                          <p className="font-medium">{log.user.display_name}</p>
                          <p className="text-xs text-muted-foreground">{log.user.email}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs break-all">{log.reference_key}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[log.status]}>
                        {STATUS_LABELS[log.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-destructive break-all">
                      {log.error ?? ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        {page > 1 ? (
          <Link
            href={pageHref(kind, status, page - 1)}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            前へ
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground/50">前へ</span>
        )}
        <span className="text-sm text-muted-foreground">{page} ページ</span>
        {hasNext ? (
          <Link
            href={pageHref(kind, status, page + 1)}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            次へ
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground/50">次へ</span>
        )}
      </div>
    </section>
  );
}
