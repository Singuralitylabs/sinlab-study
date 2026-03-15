import { BookOpen, Calendar, ClipboardList, FileText, FolderOpen, Users } from "lucide-react";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import {
  fetchAllContents,
  fetchAllPhases,
  fetchAllThemes,
  fetchAllWeeks,
  fetchStudentsProgress,
} from "@/app/services/api/admin-server";
import { fetchAllSubmissions } from "@/app/services/api/submissions-server";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const [
    { data: themes },
    { data: phases },
    { data: weeks },
    { data: contents },
    { data: students },
    { data: submissions },
  ] = await Promise.all([
    fetchAllThemes(),
    fetchAllPhases(),
    fetchAllWeeks(),
    fetchAllContents(),
    fetchStudentsProgress(),
    fetchAllSubmissions(),
  ]);

  const stats = [
    {
      title: "テーマ数",
      value: themes?.length || 0,
      href: "/admin/themes",
      icon: FolderOpen,
      bgClass: "bg-chart-1/10 text-chart-1",
    },
    {
      title: "フェーズ数",
      value: phases?.length || 0,
      href: "/admin/phases",
      icon: BookOpen,
      bgClass: "bg-chart-3/10 text-chart-3",
    },
    {
      title: "週数",
      value: weeks?.length || 0,
      href: "/admin/weeks",
      icon: Calendar,
      bgClass: "bg-chart-2/10 text-chart-2",
    },
    {
      title: "コンテンツ数",
      value: contents?.length || 0,
      href: "/admin/contents",
      icon: FileText,
      bgClass: "bg-chart-5/10 text-chart-5",
    },
    {
      title: "受講生数",
      value: students?.length || 0,
      href: "/admin/students",
      icon: Users,
      bgClass: "bg-chart-4/10 text-chart-4",
    },
    {
      title: "提出数",
      value: submissions?.length || 0,
      href: "/admin/submissions",
      icon: ClipboardList,
      bgClass: "bg-primary/10 text-primary",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <PageTitle title="管理ダッシュボード" description="学習コンテンツと受講生の管理" />

      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href} className="block group">
            <Card className="transition-all hover:shadow-md hover:border-primary/20">
              <CardContent className="pt-6">
                <div className={`inline-flex p-2 rounded-lg ${stat.bgClass} mb-3`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* 最近の提出 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">最近の提出</h2>
            <Link href="/admin/submissions" className="text-sm text-primary hover:underline">
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
