"use client";

import { Code, Link as LinkIcon, Loader2, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AIReviewDisplayNoSSR } from "@/app/components/AIReviewDisplayNoSSR";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
import { HtmlPreviewNoSSR } from "@/app/components/HtmlPreviewNoSSR";
import { LockedCodeFilesEditor } from "@/app/components/LockedCodeFilesEditor";
import { buildReviewNotice } from "@/app/lib/ai-review-response";
import { type CodeFileInput, isCodeEquivalentToStarter } from "@/app/lib/code-file-inputs";
import { canPreviewFiles } from "@/app/lib/html-preview";
import { buildLockedSubmissionFiles } from "@/app/lib/submission-file-slots";
import type { AIReviewListItem, CodeFile, Json, SubmissionType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SubmissionFormProps {
  contentId: number;
  allowedSubmissionTypes: "code" | "url" | "both";
  codeLanguage: CodeLanguage;
  starterFiles?: CodeFile[] | null;
  submissionFileSlots?: Json | null;
  /** Id of the completed review the page already renders for this submission. */
  persistedReviewId: number | null;
  /** When true, partial/unmet rows show review-list cues (learners only). */
  showReviewListNotes?: boolean;
}

function buildFailedReview(errorMessage: string): AIReviewListItem {
  return {
    id: 0,
    status: "failed",
    review_content: null,
    overall_score: null,
    review_json: null,
    score_kind: "legacy",
    rubric_version: null,
    passed: null,
    error_message: errorMessage,
    reviewed_at: null,
  };
}

export function SubmissionForm({
  contentId,
  allowedSubmissionTypes,
  codeLanguage,
  starterFiles = null,
  submissionFileSlots = null,
  persistedReviewId,
  showReviewListNotes = false,
}: SubmissionFormProps) {
  const router = useRouter();
  const [submissionType, setSubmissionType] = useState<SubmissionType>(
    allowedSubmissionTypes === "url" ? "url" : "code"
  );
  // Snapshot at mount so "unchanged starter" checks survive later prop refreshes.
  const [starterSnapshot] = useState<CodeFile[] | null>(() =>
    starterFiles && starterFiles.length > 0 ? starterFiles : null
  );
  const [initialFiles] = useState<CodeFileInput[]>(() =>
    buildLockedSubmissionFiles({
      submissionFileSlots,
      starterFiles: starterSnapshot,
      codeLanguage,
    })
  );
  const [codeFiles, setCodeFiles] = useState<CodeFileInput[]>(() =>
    initialFiles.map((file) => ({ ...file }))
  );
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [aiReview, setAiReview] = useState<AIReviewListItem | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const hasStarter = Boolean(starterSnapshot?.some((file) => file.content.trim().length > 0));
  const unchangedFromStarter = isCodeEquivalentToStarter(codeFiles, starterSnapshot);
  // Judged by the files' own languages so the UI never appears for non-web exercises.
  const showPreview = submissionType === "code" && canPreviewFiles(codeFiles);

  const resetToStarter = () => {
    setCodeFiles(initialFiles.map((file) => ({ ...file })));
  };

  const handleResetToStarter = () => {
    if (!confirm("編集中のコードを破棄して、初期コードに戻しますか？")) {
      return;
    }
    resetToStarter();
  };

  const requestAIReview = async (
    submissionId: number,
    options: { submissionJustSaved: boolean }
  ) => {
    setIsReviewLoading(true);
    try {
      const response = await fetch("/api/ai-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });

      const data = await response.json().catch(() => null);
      const isNoticeStatus = [202, 409, 429].includes(response.status);
      const notice = isNoticeStatus ? buildReviewNotice(response.status, data, options) : null;
      if (notice) {
        setMessage(notice);
        const reason = (data as { reason?: unknown } | null)?.reason;
        // A failed card left on screen hides a review the server already finished.
        const finishedElsewhere = response.status === 409 || reason === "submission_reviewed";
        if (finishedElsewhere) {
          setAiReview(null);
        }
        if (response.status === 202 || finishedElsewhere) {
          router.refresh();
        }
      } else if (response.ok && data?.review) {
        setAiReview({
          id: data.review.id,
          status: data.review.status,
          review_content: data.review.review_content,
          overall_score: data.review.overall_score,
          review_json: data.review.review_json ?? null,
          score_kind: data.review.score_kind ?? "legacy",
          rubric_version: data.review.rubric_version ?? null,
          passed: data.review.passed ?? null,
          error_message: null,
          reviewed_at: new Date().toISOString(),
        });
        setMessage({ type: "success", text: "提出が完了しました。AIレビューが生成されました。" });
        router.refresh();
      } else {
        const errorMsg = data?.error || "AIレビューの生成に失敗しました";
        setMessage({ type: "error", text: errorMsg });
        setAiReview(buildFailedReview(errorMsg));
      }
    } catch {
      const errorMsg = "ネットワークエラーが発生しました。再試行してください。";
      setMessage({ type: "error", text: errorMsg });
      setAiReview(buildFailedReview(errorMsg));
    } finally {
      setIsReviewLoading(false);
    }
  };

  const [lastSubmissionId, setLastSubmissionId] = useState<number | null>(null);
  // refresh keeps this card, so the page and the form would show the same completed row.
  const pageShowsThisReview =
    aiReview?.status === "completed" &&
    persistedReviewId != null &&
    aiReview.id === persistedReviewId;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    setAiReview(null);

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId,
          submissionType,
          codeFiles:
            submissionType === "code"
              ? codeFiles.map(({ filename, language, content }) => ({
                  filename,
                  language,
                  content,
                }))
              : null,
          url: submissionType === "url" ? url : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({ type: "success", text: "提出が完了しました。AIレビューを生成中..." });
        resetToStarter();
        setUrl("");

        const submissionId = data.submission.id;
        setLastSubmissionId(submissionId);
        requestAIReview(submissionId, { submissionJustSaved: true });
        router.refresh();
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "提出に失敗しました" });
      }
    } catch (error) {
      console.error("提出エラー:", error);
      setMessage({ type: "error", text: "提出に失敗しました" });
    } finally {
      setIsLoading(false);
    }
  };

  const isCodeValid =
    codeFiles.length > 0 &&
    codeFiles.every((file) => file.content.trim().length > 0) &&
    !unchangedFromStarter;

  const isValid =
    (submissionType === "code" && isCodeValid) ||
    (submissionType === "url" && url.trim().length > 0);

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {allowedSubmissionTypes === "both" && (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setSubmissionType("code")}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                submissionType === "code"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <Code className="h-5 w-5 mx-auto mb-1" />
              <span className="text-sm">コードで提出</span>
            </button>
            <button
              type="button"
              onClick={() => setSubmissionType("url")}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                submissionType === "url"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <LinkIcon className="h-5 w-5 mx-auto mb-1" />
              <span className="text-sm">URLで提出</span>
            </button>
          </div>
        )}

        {submissionType === "code" ? (
          <div className="space-y-3">
            <LockedCodeFilesEditor files={codeFiles} onChange={setCodeFiles} />
            {hasStarter && (
              <Button type="button" variant="outline" size="sm" onClick={handleResetToStarter}>
                <RotateCcw className="h-4 w-4" />
                初期コードに戻す
              </Button>
            )}
            {unchangedFromStarter && (
              <p className="text-xs text-muted-foreground">初期コードから変更してください</p>
            )}
            {showPreview && (
              <HtmlPreviewNoSSR
                files={codeFiles.map(({ filename, language, content }) => ({
                  filename,
                  language,
                  content,
                }))}
              />
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}

        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription className={message.type === "success" ? "text-success" : ""}>
              {message.text}
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={!isValid || isLoading} className="w-full">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Send className="h-5 w-5" />
              提出する
            </>
          )}
        </Button>
      </form>

      {!pageShowsThisReview && (
        <AIReviewDisplayNoSSR
          review={aiReview}
          isLoading={isReviewLoading}
          defaultExpanded={true}
          contentId={showReviewListNotes ? contentId : undefined}
          onRetry={
            lastSubmissionId && aiReview?.status === "failed"
              ? () => {
                  requestAIReview(lastSubmissionId, { submissionJustSaved: false });
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
