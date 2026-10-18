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
  layout = "row",
}: {
  summary: ThemeProgressSummary;
  /** Set only for completed themes of learners who can hold certificates. */
  certificatesHref?: string;
  /** Optional node shown next to the theme name (e.g. UnpublishedBadge on /learn). */
  unpublishedBadge?: ReactNode;
  /** `row` = home-style horizontal; `card` = /learn grid (#415). */
  layout?: "row" | "card";
}) {
  const { theme, totalContents, completedContents } = summary;
  const isCompleted = isThemeCompleted(summary);
  const showProgress = totalContents > 0 || completedContents > 0;

  if (layout === "card") {
    // Keep the 修了 row inside the grid cell: Link must not take 100% height alone.
    return (
      <div className="flex h-full flex-col">
        <Link href={`/learn/${theme.id}`} className="block group min-h-0 flex-1">
          <Card
            className={`h-full overflow-hidden transition-all hover:shadow-md hover:border-primary/20 ${
              isCompleted ? "border-t-4 border-t-success" : ""
            }`}
          >
            <div className="relative aspect-video w-full bg-linear-to-br from-primary/5 to-primary/15">
              {theme.image_url ? (
                <Image
                  src={resolveStorageUrl(theme.image_url)}
                  alt={theme.name}
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <BookOpen className="h-10 w-10 text-primary/30" />
                </div>
              )}
            </div>
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-start gap-2 min-w-0">
                {isCompleted ? (
                  <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium group-hover:text-primary transition-colors">
                      {theme.name}
                    </h3>
                    {unpublishedBadge}
                  </div>
                  {showProgress && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {completedContents} / {totalContents}
                    </p>
                  )}
                </div>
              </div>
              {theme.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{theme.description}</p>
              )}
              {showProgress && <Progress value={percentOf(summary)} className="h-2" />}
            </CardContent>
          </Card>
        </Link>
        {isCompleted && (
          <div className="mt-1 ml-1 flex shrink-0 items-center gap-2 text-sm">
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

  return (
    <div>
      <Link href={`/learn/${theme.id}`} className="block group">
        <Card
          className={`overflow-hidden transition-all hover:shadow-md hover:border-primary/20 ${isCompleted ? "border-l-4 border-l-success" : ""}`}
        >
          <div className="flex">
            <div className="relative w-36 shrink-0 sm:w-44 bg-linear-to-br from-primary/5 to-primary/15">
              {theme.image_url ? (
                <Image
                  src={resolveStorageUrl(theme.image_url)}
                  alt={theme.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 144px, 176px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-primary/30" />
                </div>
              )}
            </div>

            <CardContent className="px-4 pt-4 pb-4 flex-1 min-w-0 sm:px-6">
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
