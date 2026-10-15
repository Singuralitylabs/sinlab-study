import { BookOpen, CheckCircle, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { isThemeCompleted } from "@/app/lib/certificate";
import { resolveStorageUrl } from "@/app/lib/storage-url";
import type { ThemeProgressSummary } from "@/app/services/api/learning-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function percentOf({ totalContents, completedContents }: ThemeProgressSummary): number {
  return totalContents > 0 ? Math.round((completedContents / totalContents) * 100) : 0;
}

/** Theme card with progress; shared by home (active themes) and /learn. */
export function ThemeCard({
  summary,
  certificatesHref,
  unpublishedBadge,
}: {
  summary: ThemeProgressSummary;
  /** Set only for completed themes of learners who can hold certificates. */
  certificatesHref?: string;
  /** Optional node shown next to the theme name (e.g. UnpublishedBadge on /learn). */
  unpublishedBadge?: ReactNode;
}) {
  const { theme, totalContents, completedContents } = summary;
  const isCompleted = isThemeCompleted(summary);
  const showProgress = totalContents > 0 || completedContents > 0;

  return (
    <div>
      <Link href={`/learn/${theme.id}`} className="block group">
        <Card
          className={`overflow-hidden transition-all hover:shadow-md hover:border-primary/20 ${isCompleted ? "border-l-4 border-l-success" : ""}`}
        >
          <div className="flex">
            <div className="relative w-24 shrink-0 bg-linear-to-br from-primary/5 to-primary/15">
              {theme.image_url ? (
                <Image
                  src={resolveStorageUrl(theme.image_url)}
                  alt={theme.name}
                  fill
                  className="object-contain"
                  sizes="96px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-primary/30" />
                </div>
              )}
            </div>

            <CardContent className="pt-4 pb-4 flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {isCompleted ? (
                    <CheckCircle className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <h3 className="font-medium group-hover:text-primary transition-colors truncate">
                    {theme.name}
                  </h3>
                  {unpublishedBadge}
                </div>
                {showProgress && (
                  <span className="text-sm text-muted-foreground shrink-0 ml-2">
                    {completedContents} / {totalContents}
                  </span>
                )}
              </div>
              {theme.description && (
                <p className="text-sm text-muted-foreground mb-2 ml-6 line-clamp-1">
                  {theme.description}
                </p>
              )}
              {showProgress && (
                <div className="ml-6">
                  <Progress value={percentOf(summary)} className="h-2" />
                </div>
              )}
            </CardContent>
          </div>
        </Card>
      </Link>
      {isCompleted && (
        <div className="mt-1 ml-1 flex items-center gap-2 text-sm">
          <Badge variant="outline" className="border-success text-success">
            修了
          </Badge>
          {certificatesHref && (
            <Link href={certificatesHref} className="text-primary hover:underline">
              修了証を見る
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Home "学習中のテーマ" section. Empty-state copy matches the former learning-progress card
 * (first/next theme link, all done, or no content).
 */
export function ActiveThemesSection({
  active,
  firstNotStarted,
  hasCompleted,
}: {
  active: ThemeProgressSummary[];
  firstNotStarted: ThemeProgressSummary | null;
  hasCompleted: boolean;
}) {
  return (
    <section className="mb-6 grid gap-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <BookOpen className="h-5 w-5" />
        学習中のテーマ
      </h2>

      {active.length > 0 ? (
        active.map((summary) => <ThemeCard key={summary.theme.id} summary={summary} />)
      ) : firstNotStarted ? (
        <p className="text-sm">
          <Link
            href={`/learn/${firstNotStarted.theme.id}`}
            className="text-primary hover:underline"
          >
            {hasCompleted ? "次のテーマを始めましょう" : "最初のテーマを始めましょう"}
          </Link>
          （{firstNotStarted.theme.name}）
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {hasCompleted
            ? "すべてのテーマを修了しました。"
            : "学習コンテンツはまだ登録されていません。"}
        </p>
      )}
    </section>
  );
}

/** The theme list split under "learning" / "completed" / "not started" headings. */
export function ThemeSections({
  active,
  completed,
  notStarted,
  certificatesHref,
}: {
  active: ThemeProgressSummary[];
  completed: ThemeProgressSummary[];
  notStarted: ThemeProgressSummary[];
  certificatesHref?: string;
}) {
  const sections = [
    { title: "学習中", themes: active },
    { title: "修了", themes: completed, certificatesHref },
    { title: "未着手", themes: notStarted },
  ].filter((section) => section.themes.length > 0);

  return (
    <>
      {sections.map((section) => (
        <section key={section.title} className="grid gap-4">
          <h3 className="text-base font-semibold text-muted-foreground">{section.title}</h3>
          {section.themes.map((summary) => (
            <ThemeCard
              key={summary.theme.id}
              summary={summary}
              certificatesHref={section.certificatesHref}
            />
          ))}
        </section>
      ))}
    </>
  );
}
