"use client";

import { Bot, Code, FlaskConical, Link as LinkIcon, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { AIReviewDisplay } from "@/app/components/AIReviewDisplay";
import { CodeEditor, type CodeLanguage } from "@/app/components/CodeEditor";
import type { AIReview, SubmissionType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// デモ用のサンプルAIレビュー（実際のAPI呼び出しは行わない）
const SAMPLE_REVIEW: AIReview = {
  id: 0,
  submission_id: 0,
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
  model_used: "sample",
  prompt_tokens: null,
  completion_tokens: null,
  error_message: null,
  reviewed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

interface DemoSubmissionFormProps {
  allowedSubmissionTypes: "code" | "url" | "both";
  codeLanguage: CodeLanguage;
}

export function DemoSubmissionForm({
  allowedSubmissionTypes,
  codeLanguage,
}: DemoSubmissionFormProps) {
  const [submissionType, setSubmissionType] = useState<SubmissionType>(
    allowedSubmissionTypes === "url" ? "url" : "code"
  );
  const [codeContent, setCodeContent] = useState("");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [aiReview, setAiReview] = useState<AIReview | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsReviewLoading(true);
    setAiReview(null);

    // API呼び出しを行わず、サンプルレビューを表示する
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsLoading(false);
    setIsReviewLoading(false);
    setAiReview(SAMPLE_REVIEW);
  };

  const isValid =
    (submissionType === "code" && codeContent.trim().length > 0) ||
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
          <div className="space-y-2">
            <Label>コード</Label>
            <CodeEditor
              value={codeContent}
              onChange={setCodeContent}
              language={codeLanguage}
              placeholder="ここにコードを貼り付けてください..."
              minHeight="200px"
            />
          </div>
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

      <AIReviewDisplay review={aiReview} isLoading={isReviewLoading} defaultExpanded={true} />
    </div>
  );
}
