"use client";

import { Loader2, Save, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ContentType, LearningContent, LearningPhase, LearningWeek } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ContentFormProps {
  weeks: (LearningWeek & { phase: LearningPhase | null })[];
  initialData?: LearningContent;
  mode: "create" | "edit";
}

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "video", label: "動画" },
  { value: "text", label: "テキスト" },
  { value: "slide", label: "スライド（PDF）" },
  { value: "exercise", label: "演習" },
];

type AllowedSubmissionTypes = "code" | "url" | "both";

const SUBMISSION_TYPE_OPTIONS: {
  value: AllowedSubmissionTypes;
  label: string;
  description: string;
}[] = [
  { value: "code", label: "コードのみ", description: "テキストエリアにコードを貼り付けて提出" },
  {
    value: "url",
    label: "URLのみ",
    description: "スプレッドシート・デプロイ済みアプリ等のURLで提出",
  },
  { value: "both", label: "コード・URL選択", description: "受講生がどちらかを選択して提出" },
];

export function ContentForm({ weeks, initialData, mode }: ContentFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [weekId, setWeekId] = useState(initialData?.week_id?.toString() ?? "");
  const [contentType, setContentType] = useState<ContentType>(initialData?.content_type ?? "video");
  const [videoUrl, setVideoUrl] = useState(initialData?.video_url ?? "");
  const [textContent, setTextContent] = useState(initialData?.text_content ?? "");
  const [exerciseInstructions, setExerciseInstructions] = useState(
    initialData?.exercise_instructions ?? ""
  );
  const [referenceAnswer, setReferenceAnswer] = useState(initialData?.reference_answer ?? "");
  const [allowedSubmissionTypes, setAllowedSubmissionTypes] = useState<AllowedSubmissionTypes>(
    (initialData?.allowed_submission_types as AllowedSubmissionTypes) ?? "code"
  );
  const [pdfUrl, setPdfUrl] = useState(initialData?.pdf_url ?? "");
  const [displayOrder, setDisplayOrder] = useState(initialData?.display_order?.toString() ?? "0");
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setMessage({ type: "error", text: "PDFファイルのみアップロード可能です" });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-pdf", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setPdfUrl(data.url);
        setPdfFileName(file.name);
        setMessage({ type: "success", text: "PDFをアップロードしました" });
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "アップロードに失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "アップロード中にエラーが発生しました" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const body: Record<string, unknown> = {
      title,
      week_id: Number(weekId),
      content_type: contentType,
      display_order: Number(displayOrder),
      is_published: isPublished,
      video_url: contentType === "video" ? videoUrl : null,
      text_content: contentType === "text" ? textContent : null,
      exercise_instructions: contentType === "exercise" ? exerciseInstructions : null,
      reference_answer: contentType === "exercise" ? referenceAnswer || null : null,
      allowed_submission_types: contentType === "exercise" ? allowedSubmissionTypes : "code",
      pdf_url: contentType === "slide" ? pdfUrl : null,
    };

    try {
      const url =
        mode === "create" ? "/api/manage/contents" : `/api/manage/contents/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setMessage({
          type: "success",
          text: mode === "create" ? "コンテンツを作成しました" : "コンテンツを更新しました",
        });
        router.push("/manage/contents");
        router.refresh();
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "保存に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "保存中にエラーが発生しました" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* タイトル */}
          <div className="space-y-2">
            <Label htmlFor="title">タイトル</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="コンテンツのタイトル"
              required
            />
          </div>

          {/* 週の選択 */}
          <div className="space-y-2">
            <Label htmlFor="weekId">週</Label>
            <select
              id="weekId"
              value={weekId}
              onChange={(e) => setWeekId(e.target.value)}
              required
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              <option value="">選択してください</option>
              {weeks.map((week) => (
                <option key={week.id} value={week.id}>
                  {week.phase?.name ? `${week.phase.name} / ` : ""}
                  {week.name}
                </option>
              ))}
            </select>
          </div>

          {/* コンテンツ種別 */}
          <div className="space-y-2">
            <Label>コンテンツ種別</Label>
            <div className="flex gap-2">
              {CONTENT_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setContentType(opt.value)}
                  className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm transition-colors ${
                    contentType === opt.value
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 種別ごとの入力フィールド */}
          {contentType === "video" && (
            <div className="space-y-2">
              <Label htmlFor="videoUrl">YouTube URL</Label>
              <Input
                id="videoUrl"
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
          )}

          {contentType === "text" && (
            <div className="space-y-2">
              <Label htmlFor="textContent">テキスト（Markdown）</Label>
              <Textarea
                id="textContent"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Markdown形式で記述してください..."
                className="min-h-[300px] font-mono"
              />
            </div>
          )}

          {contentType === "slide" && (
            <div className="space-y-3">
              <Label>PDFファイル</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {isUploading ? "アップロード中..." : "PDFを選択"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  className="hidden"
                />
                {pdfUrl && (
                  <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
                    <span className="max-w-[200px] truncate">
                      {pdfFileName || "アップロード済みPDF"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPdfUrl("");
                        setPdfFileName(null);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              {pdfUrl && <p className="text-xs text-muted-foreground break-all">{pdfUrl}</p>}
            </div>
          )}

          {contentType === "exercise" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="exerciseInstructions">演習指示（Markdown）</Label>
                <Textarea
                  id="exerciseInstructions"
                  value={exerciseInstructions}
                  onChange={(e) => setExerciseInstructions(e.target.value)}
                  placeholder="演習の指示をMarkdown形式で記述してください..."
                  className="min-h-[300px] font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="referenceAnswer">模範回答（AIレビュー採点基準・非公開）</Label>
                <Textarea
                  id="referenceAnswer"
                  value={referenceAnswer}
                  onChange={(e) => setReferenceAnswer(e.target.value)}
                  placeholder="模範回答を記述してください。AIレビュー時の採点基準として使用され、受講生には表示されません。"
                  className="min-h-[200px] font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>提出方法</Label>
                <div className="flex gap-2">
                  {SUBMISSION_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAllowedSubmissionTypes(opt.value)}
                      className={`flex-1 rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors ${
                        allowedSubmissionTypes === opt.value
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 表示順 */}
          <div className="space-y-2">
            <Label htmlFor="displayOrder">表示順</Label>
            <Input
              id="displayOrder"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              className="w-24"
            />
          </div>

          {/* 公開設定 */}
          <div className="flex items-center gap-2">
            <input
              id="isPublished"
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="isPublished">公開する</Label>
          </div>

          {/* メッセージ */}
          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              <AlertDescription className={message.type === "success" ? "text-success" : ""}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}

          {/* 送信ボタン */}
          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading || !title || !weekId}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {mode === "create" ? "作成" : "更新"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/manage/contents")}>
              キャンセル
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
