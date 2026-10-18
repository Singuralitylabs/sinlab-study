import { BookOpen, ChevronDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { pickInitiallyOpenPhaseId, summarizePhaseProgress } from "@/app/lib/phase-progress";
import { fetchCompletedAIReviewContentIds } from "@/app/services/api/ai-review-server";
import {
  type ContentVisibilitySummary,
  fetchContentSummariesByPhaseIds,
  fetchPhasesByThemeId,
  fetchThemeById,
  fetchUserProgressByContentIds,
  isContentLockedForUser,
} from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LearnContentRow } from "../components/LearnContentRow";

interface PageProps {
  params: Promise<{ themeId: string }>;
}

export default async function ThemePage({ params }: PageProps) {
  const { themeId } = await params;
  const themeIdNum = Number.parseInt(themeId, 10);

  if (Number.isNaN(themeIdNum)) {
    notFound();
  }

  const { userId, userStatus, userRole } = await getServerAuth();

  const [{ data: theme }, { data: phases }] = await Promise.all([
    fetchThemeById(themeIdNum, userRole),
    fetchPhasesByThemeId(themeIdNum, userRole),
  ]);

  if (!theme) {
    notFound();
  }

  const phaseList = phases ?? [];
  // One batched call for the whole theme (not per phase) so the query count doesn't grow with the
  // number of phases.
  const { data: allContents } = await fetchContentSummariesByPhaseIds(
    phaseList.map((phase) => phase.id),
    userRole
  );

  const contentsByPhase = new Map<number, ContentVisibilitySummary[]>();
  for (const content of allContents ?? []) {
    const list = contentsByPhase.get(content.phase_id) ?? [];
    list.push(content);
    contentsByPhase.set(content.phase_id, list);
  }
  for (const list of contentsByPhase.values()) {
    list.sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id));
  }

  const isLocked = (content: ContentVisibilitySummary) =>
    isContentLockedForUser(userStatus, content.is_open_to_trial);
  const contentList = allContents ?? [];
  const exerciseContentIds = contentList
    .filter((c) => c.content_type === "exercise" && !isLocked(c))
    .map((c) => c.id);

  const [{ data: progressMap }, { data: reviewedContentIds }] = await Promise.all([
    userId
      ? fetchUserProgressByContentIds(
          userId,
          contentList.map((c) => c.id)
        )
      : Promise.resolve({ data: new Map<number, boolean>() }),
    userId
      ? fetchCompletedAIReviewContentIds(userId, exerciseContentIds)
      : Promise.resolve({ data: new Set<number>() }),
  ]);

  const phaseViews = phaseList.map((phase) => {
    const contents = contentsByPhase.get(phase.id) ?? [];
    const progress = summarizePhaseProgress(contents, {
      isLocked,
      ancestorsPublished: theme.is_published && phase.is_published,
      progressMap,
    });
    return { phase, contents, progress };
  });
  const openPhaseId = pickInitiallyOpenPhaseId(
    phaseViews.map(({ phase, progress }) => ({ id: phase.id, progress }))
  );

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle
        title={theme.name}
        description={theme.description || undefined}
        breadcrumbs={[{ label: "学習コンテンツ", href: "/learn" }, { label: theme.name }]}
        badge={<UnpublishedBadge isPublished={theme.is_published} />}
      />

      {phaseViews.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              このテーマにはまだフェーズが登録されていません。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {phaseViews.map(({ phase, contents, progress }) => {
            const progressValue =
              progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
            return (
              <details
                key={phase.id}
                open={phase.id === openPhaseId}
                className="group/phase rounded-xl border bg-card text-card-foreground shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center gap-4 rounded-xl p-4 [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-ring">
                  <div className="p-3 bg-primary/10 rounded-full shrink-0">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{phase.name}</h2>
                      <UnpublishedBadge isPublished={phase.is_published} />
                    </div>
                    {phase.description && (
                      <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
                    )}
                    {progress.total > 0 && (
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={progressValue} className="h-1.5 max-w-48" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {progress.completed} / {progress.total} 完了
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open/phase:rotate-180" />
                </summary>
                <div className="border-t p-4 space-y-2">
                  {contents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      このフェーズにはまだコンテンツが登録されていません。
                    </p>
                  ) : (
                    contents.map((content) => {
                      const locked = isLocked(content);
                      return (
                        <LearnContentRow
                          key={content.id}
                          href={`/learn/${themeIdNum}/${phase.id}/${content.id}`}
                          title={content.title}
                          contentType={content.content_type}
                          isPublished={content.is_published}
                          locked={locked}
                          completed={!locked && (progressMap.get(content.id) || false)}
                          aiReviewed={reviewedContentIds.has(content.id)}
                        />
                      );
                    })
                  )}
                  <Link
                    href={`/learn/${themeIdNum}/${phase.id}`}
                    className="inline-block pt-1 text-sm text-primary hover:underline"
                  >
                    フェーズのページを開く
                  </Link>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
