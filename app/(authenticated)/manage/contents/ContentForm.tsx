"use client";

import { Loader2, Save, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
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

const CODE_LANGUAGE_OPTIONS: { value: CodeLanguage; label: string }[] = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "gas", label: "GAS" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
];

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

/**
 * 既存スライドの pdf_url（例: .../slides/gas-advanced/slide-03.pdf）から
 * コーススラッグとスライド番号を抽出する。命名規約に沿わない場合は空を返す。
 */
function parseSlidePath(pdfUrl: string | null | undefined): {
  folder: string;
  slideNumber: string;
} {
  const match = pdfUrl?.match(/\/slides\/([a-z0-9-]+)\/slide-(\d+)\.pdf$/);
  if (!match) return { folder: "", slideNumber: "" };
  return { folder: match[1], slideNumber: String(Number.parseInt(match[2], 10)) };
}

export function ContentForm({ weeks, initialData, mode }: ContentFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [weekId, setWeekId] = useState(initialData?.week_id?.toString() ?? "");
  const [contentType, setContentType] = useState<ContentType>(initialData?.content_type ?? "video");
  const [videoUrl, setVideoUrl] = useState(initialData?.video_url ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [textContent, setTextContent] = useState(initialData?.text_content ?? "");
  const [exerciseInstructions, setExerciseInstructions] = useState(
    initialData?.exercise_instructions ?? ""
  );
  const [hint, setHint] = useState(initialData?.hint ?? "");
  const [referenceAnswer, setReferenceAnswer] = useState(initialData?.reference_answer ?? "");
  const [allowedSubmissionTypes, setAllowedSubmissionTypes] = useState<AllowedSubmissionTypes>(
    (initialData?.allowed_submission_types as AllowedSubmissionTypes) ?? "code"
  );
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>(
    (initialData?.code_language as CodeLanguage) ?? "javascript"
  );
  const initialSlide = parseSlidePath(initialData?.pdf_url);
  const [pdfUrl, setPdfUrl] = useState(initialData?.pdf_url ?? "");
  const [pdfFolder, setPdfFolder] = useState(initialSlide.folder);
  const [slideNumber, setSlideNumber] = useState(initialSlide.slideNumber);
  const [displayOrder, setDisplayOrder] = useState(initialData?.display_order?.toString() ?? "0");
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [isOpenToTrial, setIsOpenToTrial] = useState(initialData?.is_open_to_trial ?? false);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(
    initialSlide.folder
      ? `${initialSlide.folder}/slide-${initialSlide.slideNumber.padStart(2, "0")}.pdf`
      : null
  );

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setMessage({ type: "error", text: "PDFファイルのみアップロード可能です" });
      return;
    }

    const folder = pdfFolder.trim().toLowerCase();
    if (!folder) {
      setMessage({ type: "error", text: "保存先フォルダ（コーススラッグ）を入力してください" });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    if (!/^[a-z0-9-]+$/.test(folder)) {
      setMessage({
        type: "error",
        text: "フォルダ名は英小文字・数字・ハイフンのみ使用できます",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);
      if (slideNumber.trim()) {
        formData.append("slideNumber", slideNumber.trim());
      }

      const response = await fetch("/api/upload-pdf", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setPdfUrl(data.url);
        setPdfFileName(data.path ?? file.name);
        setMessage({ type: "success", text: `スライドをアップロードしました（${data.path}）` });
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

  // スライドのPDFが必要なのは「新規作成」と「既にPDFがある既存コンテンツ」。
  // 編集時に一律で必須にすると、一括操作で slide 種別へ変更された pdf_url が空の既存
  // コンテンツを、タイトル修正や種別の戻しすら保存できなくなる
  const requiresSlidePdf = mode === "create" || Boolean(initialData?.pdf_url);
  const isSlidePdfMissing = contentType === "slide" && requiresSlidePdf && !pdfUrl.trim();

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    // アップロード未完了・失敗のまま保存すると、実体の無い pdf_url を持つコンテンツができる。
    // 送信ボタンの disabled 条件が変わっても保存を止められるよう、ここでも同じ条件で弾く
    if (isUploading) {
      setMessage({ type: "error", text: "アップロードの完了をお待ちください" });
      return;
    }
    if (isSlidePdfMissing) {
      setMessage({ type: "error", text: "スライドPDFをアップロードしてください" });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    const body: Record<string, unknown> = {
      title,
      week_id: Number(weekId),
      content_type: contentType,
      display_order: Number(displayOrder),
      is_published: isPublished,
      is_open_to_trial: isOpenToTrial,
      video_url: contentType === "video" ? videoUrl.trim() || null : null,
      description:
        contentType === "video" || contentType === "slide" ? description.trim() || null : null,
      text_content: contentType === "text" ? textContent.trim() || null : null,
      exercise_instructions:
        contentType === "exercise" ? exerciseInstructions.trim() || null : null,
      hint: contentType === "exercise" ? hint.trim() || null : null,
      reference_answer: contentType === "exercise" ? referenceAnswer.trim() || null : null,
      allowed_submission_types: contentType === "exercise" ? allowedSubmissionTypes : "code",
      code_language: contentType === "exercise" ? codeLanguage : "javascript",
      pdf_url: contentType === "slide" ? pdfUrl.trim() || null : null,
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

          {/* 概要（video / slide のみ。詳細ページのプレイヤー／ビューア上部に表示） */}
          {(contentType === "video" || contentType === "slide") && (
            <div className="space-y-2">
              <Label htmlFor="description">概要（Markdown・任意）</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="このコンテンツで学べることを記述してください。未入力の場合は概要欄を表示しません。"
                className="min-h-[120px] font-mono"
              />
            </div>
          )}

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
              {/* 保存先フォルダ・スライド番号 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pdfFolder">保存先フォルダ（コーススラッグ）</Label>
                  <Input
                    id="pdfFolder"
                    value={pdfFolder}
                    onChange={(e) => setPdfFolder(e.target.value)}
                    placeholder="例: gas-advanced"
                  />
                  <p className="text-xs text-muted-foreground">
                    slides/&lt;フォルダ&gt;/slide-NN.pdf
                    として保存されます（英小文字・数字・ハイフン）
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slideNumber">スライド番号</Label>
                  <Input
                    id="slideNumber"
                    type="number"
                    min={1}
                    value={slideNumber}
                    onChange={(e) => setSlideNumber(e.target.value)}
                    placeholder="空欄で自動採番"
                  />
                  <p className="text-xs text-muted-foreground">
                    指定するとその番号で保存（既存は上書き）。空欄なら次の番号を自動採番。
                  </p>
                </div>
              </div>
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
                <Label htmlFor="hint">ヒント（受講生に公開）</Label>
                <Textarea
                  id="hint"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="課題提出フォームの上部にアコーディオン形式で表示されます。受講生向けのヒントを記述してください（Markdown記法は使えますが、レンダリングされずプレーンテキストとして表示されます）。未入力の場合はヒントUIを表示しません。"
                  className="min-h-[200px] font-mono"
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
                <Label>コード言語</Label>
                <div className="flex gap-2">
                  {CODE_LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCodeLanguage(opt.value)}
                      className={`rounded-lg border-2 px-3 py-2 text-sm transition-colors ${
                        codeLanguage === opt.value
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
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

          {/* お試し公開設定 */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                id="isOpenToTrial"
                type="checkbox"
                checked={isOpenToTrial}
                onChange={(e) => setIsOpenToTrial(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="isOpenToTrial">お試しユーザーにも公開する</Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              無料プラン利用中のユーザーもこのコンテンツを閲覧・提出できるようになります。
            </p>
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
            <Button
              type="submit"
              disabled={isLoading || isUploading || !title || !weekId || isSlidePdfMissing}
            >
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
