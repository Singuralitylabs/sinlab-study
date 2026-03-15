import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllSubmissions } from "@/app/services/api/submissions-server";
import { Card, CardContent } from "@/components/ui/card";

export default async function InstructorDashboardPage() {
  const { data: submissions } = await fetchAllSubmissions();

  return (
    <div className="max-w-6xl mx-auto">
      <PageTitle title="講師ダッシュボード" description="受講生の課題提出状況を確認" />

      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <Link href="/instructor/submissions" className="block group">
          <Card className="transition-all hover:shadow-md hover:border-primary/20">
            <CardContent className="pt-6">
              <div className="inline-flex p-2 rounded-lg bg-primary/10 text-primary mb-3">
                <ClipboardList className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold">{submissions?.length || 0}</p>
              <p className="text-sm text-muted-foreground">提出数</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 最近の提出 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">最近の提出</h2>
            <Link href="/instructor/submissions" className="text-sm text-primary hover:underline">
              すべて表示
            </Link>
          </div>

          {!submissions || submissions.length === 0 ? (
            <p className="text-muted-foreground">まだ提出がありません。</p>
          ) : (
            <div className="space-y-3">
              {submissions.slice(0, 5).map((submission) => (
                <div
                  key={submission.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="font-medium">{submission.user?.display_name}</p>
                    <p className="text-sm text-muted-foreground">{submission.content?.title}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {submission.submitted_at
                      ? new Date(submission.submitted_at).toLocaleDateString("ja-JP")
                      : "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
