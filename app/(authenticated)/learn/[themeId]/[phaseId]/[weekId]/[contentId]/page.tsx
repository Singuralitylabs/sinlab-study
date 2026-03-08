import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { PageTitle } from "@/app/components/PageTitle";
import { PdfSlideViewer } from "@/app/components/PdfSlideViewer";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import {
  fetchContentById,
  fetchContentsByWeekId,
  fetchUserProgressByContentId,
} from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CompleteButton } from "./CompleteButton";
import { SubmissionForm } from "./SubmissionForm";

interface PageProps {
  params: Promise<{ themeId: string; phaseId: string; weekId: string; contentId: string }>;
}

export default async function ContentPage({ params }: PageProps) {
  const { themeId, phaseId, weekId, contentId } = await params;
  const themeIdNum = Number.parseInt(themeId, 10);
  const phaseIdNum = Number.parseInt(phaseId, 10);
  const weekIdNum = Number.parseInt(weekId, 10);
  const contentIdNum = Number.parseInt(contentId, 10);

  if (
    Number.isNaN(themeIdNum) ||
    Number.isNaN(phaseIdNum) ||
    Number.isNaN(weekIdNum) ||
    Number.isNaN(contentIdNum)
  ) {
    notFound();
  }

  const { userId } = await getServerAuth();
  const { data: content } = await fetchContentById(contentIdNum);

  if (!content || content.week_id !== weekIdNum) {
    notFound();
  }

  const { data: weekContents } = await fetchContentsByWeekId(weekIdNum);
  const currentIndex = weekContents?.findIndex((c) => c.id === contentIdNum) ?? -1;
  const prevContent = currentIndex > 0 ? weekContents?.[currentIndex - 1] : null;
  const nextContent =
    currentIndex >= 0 && currentIndex < (weekContents?.length ?? 0) - 1
      ? weekContents?.[currentIndex + 1]
      : null;

  const { isCompleted } = userId
    ? await fetchUserProgressByContentId(userId, contentIdNum)
    : { isCompleted: false };

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle
        title={content.title}
        breadcrumbs={[
          { label: "学習コンテンツ", href: "/learn" },
          {
            label: content.week?.phase?.theme?.name || "テーマ",
            href: `/learn/${themeIdNum}`,
          },
          {
            label: content.week?.phase?.name || "フェーズ",
            href: `/learn/${themeIdNum}/${phaseIdNum}`,
          },
          { label: content.title },
        ]}
      />

      {/* コンテンツ本体 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          {content.content_type === "video" && content.video_url && (
            <div className="mb-6">
              <YouTubeEmbed url={content.video_url} />
            </div>
          )}

          {content.content_type === "text" && content.text_content && (
            <MarkdownRenderer content={content.text_content} />
          )}

          {content.content_type === "slide" && content.pdf_url && (
            <PdfSlideViewer url={content.pdf_url} />
          )}

          {content.content_type === "exercise" && content.exercise_instructions && (
            <div>
              <MarkdownRenderer content={content.exercise_instructions} />

              {userId && (
                <div className="mt-8">
                  <Separator className="mb-6" />
                  <h3 className="text-lg font-semibold mb-4">課題提出</h3>
                  <SubmissionForm contentId={contentIdNum} userId={userId} />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 完了ボタン */}
      {userId && (
        <div className="mb-6">
          <CompleteButton contentId={contentIdNum} userId={userId} initialCompleted={isCompleted} />
        </div>
      )}

      {/* 前後ナビゲーション */}
      <div className="flex items-center justify-between gap-4">
        {prevContent ? (
          <Button variant="outline" asChild className="flex-1 justify-start">
            <Link href={`/learn/${themeIdNum}/${phaseIdNum}/${weekIdNum}/${prevContent.id}`}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="truncate">{prevContent.title}</span>
            </Link>
          </Button>
        ) : (
          <div className="flex-1" />
        )}

        {nextContent ? (
          <Button variant="outline" asChild className="flex-1 justify-end">
            <Link href={`/learn/${themeIdNum}/${phaseIdNum}/${weekIdNum}/${nextContent.id}`}>
              <span className="truncate">{nextContent.title}</span>
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        ) : (
          <Button asChild className="flex-1 justify-center">
            <Link href={`/learn/${themeIdNum}/${phaseIdNum}`}>フェーズに戻る</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
