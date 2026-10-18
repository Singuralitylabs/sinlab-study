import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { PageTitle } from "@/app/components/PageTitle";
import { SlideContent } from "@/app/components/SlideContent";
import { YouTubeEmbed } from "@/app/components/YouTubeEmbed";
import { parseStarterFiles } from "@/app/lib/code-file-inputs";
import { resolveMarkdownStorageUrls } from "@/app/lib/storage-url";
import {
  createDemoSlideSignedUrl,
  fetchDemoContentById,
  fetchDemoContentsByPhaseId,
  fetchDemoContext,
} from "@/app/services/api/demo-learning-server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DemoCompleteButton } from "../../../components/DemoCompleteButton";
import { DemoSubmissionForm } from "../../../components/DemoSubmissionForm";

interface PageProps {
  params: Promise<{
    themeId: string;
    phaseId: string;
    contentId: string;
  }>;
}

export default async function DemoContentPage({ params }: PageProps) {
  const { themeId, phaseId, contentId } = await params;
  const themeIdNum = Number.parseInt(themeId, 10);
  const phaseIdNum = Number.parseInt(phaseId, 10);
  const contentIdNum = Number.parseInt(contentId, 10);

  if (Number.isNaN(themeIdNum) || Number.isNaN(phaseIdNum) || Number.isNaN(contentIdNum)) {
    notFound();
  }

  const [{ data: content }, { data: ctx }] = await Promise.all([
    fetchDemoContentById(contentIdNum),
    fetchDemoContext(),
  ]);

  if (!content || content.phase_id !== phaseIdNum) {
    notFound();
  }

  if (content.phase?.id !== phaseIdNum || content.phase?.theme?.id !== themeIdNum) {
    notFound();
  }

  const themeName = content.phase?.theme?.name ?? "テーマ";
  const phaseName = content.phase?.name ?? "フェーズ";

  const breadcrumbs = [
    { label: "学習コンテンツ", href: "/demo" },
    { label: themeName, href: `/demo/${themeIdNum}` },
    { label: phaseName, href: `/demo/${themeIdNum}/${phaseIdNum}` },
    { label: content.title },
  ];

  // Trial-open only: without this the whole first phase would be readable while logged out.
  const isDemoAccessible =
    ctx !== null && content.phase_id === ctx.phase.id && content.is_open_to_trial;

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
              <h2 className="text-lg font-semibold mb-2">このコンテンツはデモの対象外です</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                デモでご覧いただけるのは、最初のフェーズのお試し公開コンテンツのみです。ログインすると、本サービスでお試し公開コンテンツの閲覧・課題提出をご利用いただけます。
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link href="/login">ログインする</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Slide signed URL (same scope as trial users: only published, is_open_to_trial = true slides;
  // decided by createDemoSlideSignedUrl() itself; #89) is fetched in parallel with the phase's
  // content list.
  const [{ data: phaseContents }, slideSignedUrl] = await Promise.all([
    fetchDemoContentsByPhaseId(phaseIdNum),
    content.content_type === "slide" && content.is_open_to_trial
      ? createDemoSlideSignedUrl(content)
      : Promise.resolve(null),
  ]);

  const currentIndex = phaseContents?.findIndex((c) => c.id === contentIdNum) ?? -1;
  const prevContent = currentIndex > 0 ? phaseContents?.[currentIndex - 1] : null;
  const nextContent =
    currentIndex >= 0 && currentIndex < (phaseContents?.length ?? 0) - 1
      ? phaseContents?.[currentIndex + 1]
      : null;

  const demoBasePath = `/demo/${themeIdNum}/${phaseIdNum}`;

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
            <MarkdownRenderer content={resolveMarkdownStorageUrls(content.text_content)} />
          )}

          {/* The article uses the same trial-open gate as the PDF. This page still loads a
              published, not-trial slide so it can show the lock message; rendering text_content
              there would publish the article. */}
          {content.content_type === "slide" &&
            (content.is_open_to_trial ? (
              <>
                {content.pdf_url && (
                  <div className={content.text_content ? "mb-6" : undefined}>
                    <SlideContent signedUrl={slideSignedUrl} />
                  </div>
                )}
                {content.text_content && (
                  <MarkdownRenderer content={resolveMarkdownStorageUrls(content.text_content)} />
                )}
              </>
            ) : (
              content.pdf_url && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  このスライドはお試し公開の対象外です。ログイン後に本登録すると閲覧できます。
                </p>
              )
            ))}

          {/* The demo reads via service_role, which must never reach quiz_questions (it holds the
              answers); questions are served only to logged-in users through get_quiz_questions. */}
          {content.content_type === "quiz" && (
            <div className="space-y-6">
              {content.description && (
                <MarkdownRenderer content={resolveMarkdownStorageUrls(content.description)} />
              )}
              <p className="py-8 text-center text-sm text-muted-foreground">
                クイズはログイン後に解答できます。
              </p>
            </div>
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
                  starterFiles={parseStarterFiles(content.starter_files)}
                  submissionFileSlots={content.submission_file_slots}
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
          <Button variant="outline" asChild className="min-w-0 flex-1 justify-start">
            <Link href={`${demoBasePath}/${prevContent.id}`}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="truncate">{prevContent.title}</span>
            </Link>
          </Button>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        {nextContent ? (
          <Button variant="outline" asChild className="min-w-0 flex-1 justify-end">
            <Link href={`${demoBasePath}/${nextContent.id}`}>
              <span className="truncate">{nextContent.title}</span>
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        ) : (
          <Button asChild className="min-w-0 flex-1 justify-center">
            <Link href={`/demo/${themeIdNum}/${phaseIdNum}`}>フェーズに戻る</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
