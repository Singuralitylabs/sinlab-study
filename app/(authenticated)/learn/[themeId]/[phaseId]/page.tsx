import { Bot, Calendar, CheckCircle, Clock, FileText, PenLine, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchCompletedAIReviewContentIds } from "@/app/services/api/ai-review-server";
import {
  fetchPhaseById,
  fetchThemeById,
  fetchUserProgressByContentIds,
  fetchWeeksWithContentsByPhaseId,
} from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import type { ContentType } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface PageProps {
  params: Promise<{ themeId: string; phaseId: string }>;
}

function getContentIcon(type: ContentType) {
  switch (type) {
    case "video":
      return <Play className="h-4 w-4" />;
    case "text":
      return <FileText className="h-4 w-4" />;
    case "exercise":
      return <PenLine className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function getContentTypeLabel(type: ContentType) {
  switch (type) {
    case "video":
      return "動画";
    case "text":
      return "テキスト";
    case "exercise":
      return "演習";
    default:
      return type;
  }
}

export default async function PhasePage({ params }: PageProps) {
  const { themeId, phaseId } = await params;
  const themeIdNum = Number.parseInt(themeId, 10);
  const phaseIdNum = Number.parseInt(phaseId, 10);

  if (Number.isNaN(themeIdNum) || Number.isNaN(phaseIdNum)) {
    notFound();
  }

  const { userId } = await getServerAuth();

  const [{ data: theme }, { data: phase }, { data: weeks }] = await Promise.all([
    fetchThemeById(themeIdNum),
    fetchPhaseById(phaseIdNum),
    fetchWeeksWithContentsByPhaseId(phaseIdNum),
  ]);

  if (!theme || !phase || phase.theme_id !== themeIdNum) {
    notFound();
  }

  // 全コンテンツのIDを集めて進捗を一括取得
  const allContentIds = weeks?.flatMap((w) => w.contents.map((c) => c.id)) || [];
  const exerciseContentIds =
    weeks?.flatMap((w) =>
      w.contents.filter((c) => c.content_type === "exercise").map((c) => c.id)
    ) ?? [];

  const [{ data: progressMap }, { data: reviewedContentIds }] = await Promise.all([
    userId
      ? fetchUserProgressByContentIds(userId, allContentIds)
      : Promise.resolve({ data: new Map<number, boolean>() }),
    userId
      ? fetchCompletedAIReviewContentIds(userId, exerciseContentIds)
      : Promise.resolve({ data: new Set<number>() }),
  ]);

  const completedCount = Array.from(progressMap.values()).filter(Boolean).length;
  const totalCount = allContentIds.length;
  const progressValue = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle
        title={phase.name}
        description={phase.description || undefined}
        breadcrumbs={[
          { label: "学習コンテンツ", href: "/learn" },
          { label: theme.name, href: `/learn/${themeIdNum}` },
          { label: phase.name },
        ]}
      />

      {/* 進捗サマリー */}
      {totalCount > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                進捗: {completedCount} / {totalCount} 完了
              </span>
              <span className="text-sm font-medium">{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-2" />
          </CardContent>
        </Card>
      )}

      {!weeks || weeks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">このフェーズにはまだ週が登録されていません。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {weeks.map((week) => {
            const weekCompletedCount = week.contents.filter((c) => progressMap.get(c.id)).length;
            const weekTotalCount = week.contents.length;
            const allCompleted = weekTotalCount > 0 && weekCompletedCount === weekTotalCount;

            return (
              <div key={week.id}>
                {/* 週ヘッダー */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`p-2 rounded-full ${
                      allCompleted ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {allCompleted ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Calendar className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-base font-semibold">{week.name}</h2>
                    {week.description && (
                      <p className="text-sm text-muted-foreground">{week.description}</p>
                    )}
                  </div>
                  {weekTotalCount > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {weekCompletedCount} / {weekTotalCount}
                    </span>
                  )}
                </div>

                {/* コンテンツ一覧 */}
                {week.contents.length === 0 ? (
                  <p className="text-sm text-muted-foreground ml-12">
                    コンテンツはまだ登録されていません。
                  </p>
                ) : (
                  <div className="grid gap-2 ml-5 border-l-2 border-border pl-5">
                    {week.contents.map((content) => {
                      const isCompleted = progressMap.get(content.id) || false;

                      return (
                        <Link
                          key={content.id}
                          href={`/learn/${themeIdNum}/${phaseIdNum}/${week.id}/${content.id}`}
                          className="block group"
                        >
                          <Card
                            className={`transition-all hover:shadow-sm hover:border-primary/20 ${
                              isCompleted ? "border-l-4 border-l-success" : ""
                            }`}
                          >
                            <CardContent className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-1.5 rounded-full shrink-0 ${
                                    isCompleted
                                      ? "bg-success/10 text-success"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {isCompleted ? (
                                    <CheckCircle className="h-4 w-4" />
                                  ) : (
                                    <Clock className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                                    {content.title}
                                  </h3>
                                </div>
                                <Badge variant="secondary" className="gap-1 shrink-0 text-xs">
                                  {getContentIcon(content.content_type)}
                                  {getContentTypeLabel(content.content_type)}
                                </Badge>
                                {content.content_type === "exercise" &&
                                  reviewedContentIds.has(content.id) && (
                                    <Badge
                                      variant="outline"
                                      className="gap-1 shrink-0 text-xs border-primary/40 text-primary"
                                    >
                                      <Bot className="h-3 w-3" />
                                      AIレビュー済み
                                    </Badge>
                                  )}
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
