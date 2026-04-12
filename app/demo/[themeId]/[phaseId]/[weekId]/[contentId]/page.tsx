import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CodeLanguage } from "@/app/components/CodeEditor";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { PageTitle } from "@/app/components/PageTitle";
import { PdfSlideViewerNoSSR as PdfSlideViewer } from "@/app/components/PdfSlideViewerNoSSR";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import {
  fetchDemoContentById,
  fetchDemoContentsByWeekId,
  fetchDemoContext,
} from "@/app/services/api/demo-learning-server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DemoCompleteButton } from "../../../../components/DemoCompleteButton";
import { DemoSubmissionForm } from "../../../../components/DemoSubmissionForm";

interface PageProps {
  params: Promise<{
    themeId: string;
    phaseId: string;
    weekId: string;
    contentId: string;
  }>;
}

export default async function DemoContentPage({ params }: PageProps) {
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

  const [{ data: content }, { data: ctx }] = await Promise.all([
    fetchDemoContentById(contentIdNum),
    fetchDemoContext(),
  ]);

  if (!content || content.week_id !== weekIdNum) {
    notFound();
  }

  if (content.week?.phase?.id !== phaseIdNum || content.week?.phase?.theme?.id !== themeIdNum) {
    notFound();
  }

  const themeName = content.week?.phase?.theme?.name ?? "テーマ";
  const phaseName = content.week?.phase?.name ?? "フェーズ";

  const breadcrumbs = [
    { label: "学習コンテンツ", href: "/demo" },
    { label: themeName, href: `/demo/${themeIdNum}` },
    { label: phaseName, href: `/demo/${themeIdNum}/${phaseIdNum}` },
    { label: content.title },
  ];

  // デモとしてアクセス可能かどうか（Phase1・Week1のみ）
  const isDemoAccessible = ctx !== null && content.week_id === ctx.week.id;

  // ロック画面
  if (!isDemoAccessible) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageTitle title={content.title} breadcrumbs={breadcrumbs} />

        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <div className="p-4 rounded-full bg-muted">
              <Lock className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">承認されたアカウントのみ閲覧できます</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                このコンテンツを閲覧するにはアカウントの承認が必要です。
                ログインしてアカウント承認をリクエストしてください。
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link href="/login">ログインして続ける</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // デモアクセス可能なコンテンツ
  const { data: weekContents } = await fetchDemoContentsByWeekId(weekIdNum);

  const currentIndex = weekContents?.findIndex((c) => c.id === contentIdNum) ?? -1;
  const prevContent = currentIndex > 0 ? weekContents?.[currentIndex - 1] : null;
  const nextContent =
    currentIndex >= 0 && currentIndex < (weekContents?.length ?? 0) - 1
      ? weekContents?.[currentIndex + 1]
      : null;

  const demoBasePath = `/demo/${themeIdNum}/${phaseIdNum}/${weekIdNum}`;

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle title={content.title} breadcrumbs={breadcrumbs} />

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
            <PdfSlideViewer
              url={
                /^https?:\/\//.test(content.pdf_url)
                  ? content.pdf_url
                  : `${process.env.NEXT_PUBLIC_SUPABASE_URL}${content.pdf_url}`
              }
            />
          )}

          {content.content_type === "exercise" && content.exercise_instructions && (
            <div>
              <MarkdownRenderer content={content.exercise_instructions} />

              {content.hint && (
                <details className="mt-4 rounded-lg border border-border">
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground list-none flex items-center gap-2">
                    <span className="text-base">💡</span>
                    ヒントを見る
                  </summary>
                  <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap">
                    {content.hint}
                  </div>
                </details>
              )}

              <div className="mt-8">
                <Separator className="mb-6" />
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">課題提出</h3>
                  <span className="text-xs text-muted-foreground">
                    ※ デモでは提出内容はDBに保存されません
                  </span>
                </div>
                <DemoSubmissionForm
                  allowedSubmissionTypes={
                    (content.allowed_submission_types as "code" | "url" | "both") ?? "code"
                  }
                  codeLanguage={(content.code_language as CodeLanguage) ?? "javascript"}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-6">
        <DemoCompleteButton contentId={contentIdNum} />
      </div>

      <div className="flex items-center justify-between gap-4">
        {prevContent ? (
          <Button variant="outline" asChild className="flex-1 justify-start">
            <Link href={`${demoBasePath}/${prevContent.id}`}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="truncate">{prevContent.title}</span>
            </Link>
          </Button>
        ) : (
          <div className="flex-1" />
        )}

        {nextContent ? (
          <Button variant="outline" asChild className="flex-1 justify-end">
            <Link href={`${demoBasePath}/${nextContent.id}`}>
              <span className="truncate">{nextContent.title}</span>
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        ) : (
          <Button asChild className="flex-1 justify-center">
            <Link href={`/demo/${themeIdNum}/${phaseIdNum}`}>フェーズに戻る</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
