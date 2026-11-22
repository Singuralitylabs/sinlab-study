import { Award, BookOpen, CheckCircle, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { isThemeCompleted } from "@/app/lib/certificate";
import { resolveStorageUrl } from "@/app/lib/storage-url";
import type { ThemeProgressSummary } from "@/app/services/api/learning-server";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function percentOf({ totalContents, completedContents }: ThemeProgressSummary): number {
  return totalContents > 0 ? Math.round((completedContents / totalContents) * 100) : 0;
}

function CompletedThumbnailBadge() {
  return (
    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-bold text-white shadow-sm">
      <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
      修了
    </span>
  );
}

// Sibling of the card's main Link, not a child: nested <a> is invalid HTML and breaks clicks.
function CertificateFooter({ href, className }: { href: string; className: string }) {
  return (
    <div className={`border-t border-success/30 text-sm ${className}`}>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
      >
        <Award className="h-4 w-4 text-success" aria-hidden="true" />
        修了証を見る
      </Link>
    </div>
  );
}

const COMPLETED_CARD_CLASS = "border-2 border-success bg-success/5";
const COMPLETED_PROGRESS_CLASS = "bg-success/20 [&>[data-slot=progress-indicator]]:bg-success";

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
  const certificateHref = isCompleted ? certificatesHref : undefined;
  const cardStateClass = isCompleted ? COMPLETED_CARD_CLASS : "hover:border-primary/20";
  const progressClass = `h-2 ${isCompleted ? COMPLETED_PROGRESS_CLASS : ""}`;
  const countClass = isCompleted ? "font-medium text-success" : "text-muted-foreground";
  const count = (
    <>
      {completedContents} / {totalContents}
      {isCompleted && <span className="ml-1.5">修了</span>}
    </>
  );

  if (layout === "card") {
    return (
      <Card className={`h-full overflow-hidden transition-all hover:shadow-md ${cardStateClass}`}>
        <Link href={`/learn/${theme.id}`} className="group flex min-h-0 flex-1 flex-col gap-6">
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
            {isCompleted && <CompletedThumbnailBadge />}
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
                {showProgress && <p className={`text-sm mt-0.5 ${countClass}`}>{count}</p>}
              </div>
            </div>
            {theme.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{theme.description}</p>
            )}
            {showProgress && <Progress value={percentOf(summary)} className={progressClass} />}
          </CardContent>
        </Link>
        {certificateHref && (
          <CertificateFooter href={certificateHref} className="-mt-3 px-6 pt-3" />
        )}
      </Card>
    );
  }

  return (
    <Card className={`gap-0 overflow-hidden py-0 transition-all hover:shadow-md ${cardStateClass}`}>
      <Link href={`/learn/${theme.id}`} className="group flex">
        <div className="relative min-h-24 w-36 shrink-0 sm:w-44 bg-linear-to-br from-primary/5 to-primary/15">
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
          {isCompleted && <CompletedThumbnailBadge />}
        </div>

        <CardContent className="flex min-w-0 flex-1 flex-col justify-center px-4 pt-4 pb-4 sm:px-6">
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
            {showProgress && <span className={`text-sm shrink-0 ml-2 ${countClass}`}>{count}</span>}
          </div>
          {theme.description && (
            <p className="text-sm text-muted-foreground mb-2 ml-6 line-clamp-1">
              {theme.description}
            </p>
          )}
          {showProgress && (
            <div className="ml-6">
              <Progress value={percentOf(summary)} className={progressClass} />
            </div>
          )}
        </CardContent>
      </Link>
      {certificateHref && (
        <CertificateFooter href={certificateHref} className="px-4 py-2 sm:px-6" />
      )}
    </Card>
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
