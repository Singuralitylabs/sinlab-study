import { BookOpen } from "lucide-react";
import { PageTitle } from "@/app/components/PageTitle";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { isCertificateEligible, isThemeCompleted } from "@/app/lib/certificate";
import {
  fetchPublishedThemes,
  fetchThemeProgressSummaries,
  type ThemeProgressSummary,
} from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card } from "@/components/ui/card";
import { ThemeCard } from "../components/ThemeProgressSections";

export default async function LearnPage() {
  const { userId, userRole, userStatus } = await getServerAuth();
  const [{ data: themes }, { data: progressData }] = await Promise.all([
    fetchPublishedThemes(userRole),
    userId
      ? fetchThemeProgressSummaries(userId)
      : Promise.resolve({ data: [] as ThemeProgressSummary[], error: null }),
  ]);

  const progressByThemeId = new Map(
    (progressData ?? []).map((summary) => [summary.theme.id, summary])
  );
  const certificatesHref = isCertificateEligible(userStatus, userRole)
    ? "/certificates"
    : undefined;

  return (
    <div className="max-w-5xl mx-auto">
      <PageTitle title="学習コンテンツ" description="学習テーマを選択して学習を始めましょう" />

      {!themes || themes.length === 0 ? (
        <Card className="py-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">学習コンテンツはまだ登録されていません。</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => {
            // Unpublished themes (admin/maintainer preview) have no progress rows; pass 0/0 so
            // ThemeCard's showProgress (totalContents > 0 || completedContents > 0) hides the bar.
            const progressSummary = progressByThemeId.get(theme.id);
            const hasProgressRow = theme.is_published !== false && progressSummary != null;
            const summary = hasProgressRow
              ? progressSummary
              : { theme, totalContents: 0, completedContents: 0 };
            return (
              <ThemeCard
                key={theme.id}
                layout="card"
                summary={summary}
                certificatesHref={
                  hasProgressRow && isThemeCompleted(summary) ? certificatesHref : undefined
                }
                unpublishedBadge={<UnpublishedBadge isPublished={theme.is_published} />}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
