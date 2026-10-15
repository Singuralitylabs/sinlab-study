"use client";

import { Bot, Code, FlaskConical, Link as LinkIcon, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { AIReviewDisplayNoSSR } from "@/app/components/AIReviewDisplayNoSSR";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
import { LockedCodeFilesEditor } from "@/app/components/LockedCodeFilesEditor";
import type { CodeFileInput } from "@/app/lib/code-file-inputs";
import { buildLockedSubmissionFiles } from "@/app/lib/submission-file-slots";
import type { AIReviewListItem, CodeFile, Json, SubmissionType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SAMPLE_REVIEW: AIReviewListItem = {
  id: 0,
  status: "completed",
  review_content: `## 総評

提出内容を拝見しました。課題の要件を理解した上で取り組まれており、全体的な方向性は正しいです。

## 良い点

- コードの基本構造が適切に組み立てられています
- 変数名や関数名が処理内容を反映しており、可読性が高いです
- 処理の流れが論理的に組み立てられています

## 改善できる点

- エラーハンドリングを追加することで、より堅牢なコードになります
- 処理を小さな関数に分割することで、再利用性と保守性が向上します
- コメントを適切に追加することで、コードの意図がより明確になります

## まとめ

基礎的な実装はできています。本番環境では提出されたコードの内容に基づいた詳細なフィードバックをお届けします。`,
  overall_score: 75,
  review_json: null,
  score_kind: "legacy",
  rubric_version: null,
  passed: null,
  error_message: null,
  reviewed_at: new Date().toISOString(),
};

interface DemoSubmissionFormProps {
  allowedSubmissionTypes: "code" | "url" | "both";
  codeLanguage: CodeLanguage;
  starterFiles?: CodeFile[] | null;
  submissionFileSlots?: Json | null;
}

export function DemoSubmissionForm({
  allowedSubmissionTypes,
  codeLanguage,
  starterFiles = null,
  submissionFileSlots = null,
}: DemoSubmissionFormProps) {
  const [submissionType, setSubmissionType] = useState<SubmissionType>(
    allowedSubmissionTypes === "url" ? "url" : "code"
  );
  const [codeFiles, setCodeFiles] = useState<CodeFileInput[]>(() =>
    buildLockedSubmissionFiles({
      submissionFileSlots,
      starterFiles,
      codeLanguage,
    })
  );
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [aiReview, setAiReview] = useState<AIReviewListItem | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setIsReviewLoading(true);
    setAiReview(null);

    // Demo: show the sample review instead of calling the API.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsLoading(false);
    setIsReviewLoading(false);
    setAiReview(SAMPLE_REVIEW);
  };

  const isCodeValid =
    codeFiles.length > 0 && codeFiles.every((file) => file.content.trim().length > 0);

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
          <LockedCodeFilesEditor files={codeFiles} onChange={setCodeFiles} />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="demo-url">URL</Label>
            <Input
              type="url"
              id="demo-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}

        <Button type="submit" disabled={!isValid || isLoading} className="w-full">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Send className="h-5 w-5" />
              提出してAIレビューを受ける
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          ※ デモアプリでは実際のAIレビューは行われません。サンプルのレビュー結果が表示されます。
        </p>
      </form>

      {aiReview && (
        <Alert className="border-primary/30 bg-primary/5">
          <Bot className="h-4 w-4 text-primary" />
          <AlertDescription className="flex items-center gap-2">
            <FlaskConical className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              <strong>これはサンプルレビューです。</strong>
              本番環境では提出内容に基づいた詳細なAIフィードバックが届きます。
            </span>
          </AlertDescription>
        </Alert>
      )}

      <AIReviewDisplayNoSSR review={aiReview} isLoading={isReviewLoading} defaultExpanded={true} />
    </div>
  );
}
