import { BookOpen, ClipboardList, FileText, FolderOpen, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageTitle } from "@/app/components/PageTitle";
import { resolveWeeklyFunnelWeeks } from "@/app/constants/analytics";
import {
  fetchContentEngagementStats,
  fetchManageCounts,
  fetchWeeklyFunnel,
} from "@/app/services/api/admin-server";
import { checkAdminPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { ContentEngagementCard } from "../components/ContentEngagementCard";
import { WeeklyFunnelCard } from "../components/WeeklyFunnelCard";

interface ManageDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ManageDashboardPage({ searchParams }: ManageDashboardPageProps) {
  const params = await searchParams;
  const weeks = resolveWeeklyFunnelWeeks(params.weeks);

  const { userRole } = await getServerAuth();
  const isAdmin = checkAdminPermissions(userRole);

  const [{ data: counts }, funnel, engagement] = await Promise.all([
    fetchManageCounts(),
    fetchWeeklyFunnel(weeks),
    fetchContentEngagementStats(),
  ]);

  const summary = [
    {
      title: "テーマ数",
      value: counts.themes,
      href: "/manage/contents",
      icon: FolderOpen,
    },
    {
      title: "フェーズ数",
      value: counts.phases,
      href: "/manage/contents",
      icon: BookOpen,
    },
    {
      title: "コンテンツ数",
      value: counts.contents,
      href: "/manage/contents",
      icon: FileText,
    },
    {
      title: "受講生数",
      value: counts.students,
      href: isAdmin ? "/manage/students" : null,
      icon: Users,
    },
    {
      title: "提出数",
      value: counts.submissions,
      href: "/manage/submissions",
      icon: ClipboardList,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <PageTitle title="ダッシュボード" description="受講生サマリーとコンテンツ別の取り組み状況" />

      <div className="mb-8 flex flex-wrap gap-4 rounded-lg border bg-muted/30 px-4 py-3">
        {summary.map((stat) => {
          const body = (
            <div className="flex items-center gap-3">
              <stat.icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{stat.title}</p>
                <p className="text-lg font-semibold leading-none">{stat.value}</p>
              </div>
            </div>
          );
          if (!stat.href) {
            return (
              <div key={stat.title} className="min-w-[8rem]">
                {body}
              </div>
            );
          }
          return (
            <Link
              key={stat.title}
              href={stat.href}
              className="min-w-[8rem] rounded-md transition-colors hover:bg-accent/60"
            >
              {body}
            </Link>
          );
        })}
      </div>

      <ContentEngagementCard data={engagement.data} errorMessage={engagement.error} />

      <Suspense fallback={null}>
        <WeeklyFunnelCard rows={funnel.data} errorMessage={funnel.error} weeks={weeks} />
      </Suspense>
    </div>
  );
}
