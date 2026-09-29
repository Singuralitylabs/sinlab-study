"use client";

import { Loader2, Save, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CodeLanguage } from "@/app/components/code-editor-utils";
import { SLIDE_NUMBER_MAX } from "@/app/constants/slides";
import type {
  PhaseFilterOption,
  ThemeFilterOption,
  WeekFilterOption,
} from "@/app/lib/content-filtering";
import { parseSlideObjectKey, toSlideObjectKey } from "@/app/lib/slide-object-key";
import { getSlideStorageWarning } from "@/app/lib/slide-storage-warning";
import type { ContentType, LearningContent } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getCurrentPositionInsertAfterId,
  getDefaultInsertAfterId,
  type SiblingCandidate,
  SiblingOrderField,
} from "../components/SiblingOrderField";

const SELECT_CLASS_NAME =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

interface InitialWeekSelection {
  themeId?: string;
  phaseId?: string;
  weekId?: string;
}

interface ContentFormProps {
  themes: ThemeFilterOption[];
  phases: PhaseFilterOption[];
  weeks: WeekFilterOption[];
  initialData?: LearningContent;
  initialWeekSelection?: InitialWeekSelection;
  /**
   * Includes the target itself in edit mode so its current position can be found; filtered out in
   * the form before display.
   */
  siblingCandidates?: SiblingCandidate[];
  mode: "create" | "edit";
}

/**
 * Reverse-lookup of theme/phase from a week id. If the week is missing from the options
 * (unclassified/deleted), skip theme/phase preselection but keep the week value so it can be
 * re-saved.
 */
function resolveWeekSelection(
  weekId: string,
  phases: PhaseFilterOption[],
  weeks: WeekFilterOption[]
): { themeId: string; phaseId: string; weekId: string } {
  const week = weekId ? weeks.find((w) => String(w.id) === weekId) : undefined;
  if (!week) {
    return { themeId: "", phaseId: "", weekId };
  }
  const phase = phases.find((p) => p.id === week.phaseId);
  return {
    themeId: phase ? String(phase.themeId) : "",
    phaseId: String(week.phaseId),
    weekId,
  };
}

/**
 * Labels include the unfiltered parent names because a week can be picked without choosing
 * theme/phase; this disambiguates same-named weeks.
 */
function buildWeekOptionLabel(
  week: WeekFilterOption,
  phases: PhaseFilterOption[],
  themes: ThemeFilterOption[],
  themeId: string,
  phaseId: string
): string {
  if (phaseId) return week.name;

  const phase = phases.find((p) => p.id === week.phaseId);
  if (themeId) return phase ? `${phase.name} / ${week.name}` : week.name;

  const theme = phase ? themes.find((t) => t.id === phase.themeId) : undefined;
  const prefix = [theme?.name, phase?.name].filter(Boolean).join(" / ");
  return prefix ? `${prefix} / ${week.name}` : week.name;
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

export function ContentForm({
  themes,
  phases,
  weeks,
  initialData,
  initialWeekSelection,
  siblingCandidates = [],
  mode,
}: ContentFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialData?.title ?? "");

  // Edit mode keeps initialData.week_id even if it is not in the options so saving doesn't clobber
  // it. Create mode adopts the query-derived selection only when theme, phase and week all exist;
  // otherwise the form would look unselected yet be submittable.
  const initialWeekIdValue =
    mode === "edit"
      ? (initialData?.week_id?.toString() ?? "")
      : weeks.some((w) => String(w.id) === initialWeekSelection?.weekId)
        ? (initialWeekSelection?.weekId ?? "")
        : "";
  const resolvedInitialSelection = resolveWeekSelection(initialWeekIdValue, phases, weeks);
  const initialThemeIdFallback =
    mode === "create" && themes.some((t) => String(t.id) === initialWeekSelection?.themeId)
      ? (initialWeekSelection?.themeId ?? "")
      : "";
  // The phase must also belong to the adopted theme; a query like ?theme=1&phase=2 can be
  // individually valid but inconsistent.
  const initialPhaseIdFallback =
    mode === "create" &&
    phases.some(
      (p) =>
        String(p.id) === initialWeekSelection?.phaseId &&
        (!initialThemeIdFallback || String(p.themeId) === initialThemeIdFallback)
    )
      ? (initialWeekSelection?.phaseId ?? "")
      : "";

  const [themeId, setThemeId] = useState(
    resolvedInitialSelection.themeId || initialThemeIdFallback
  );
  const [phaseId, setPhaseId] = useState(
    resolvedInitialSelection.phaseId || initialPhaseIdFallback
  );
  const initialWeekId = resolvedInitialSelection.weekId;
  const [weekId, setWeekId] = useState(initialWeekId);
  const allSiblingsForWeek = siblingCandidates.filter((c) => String(c.parentId) === weekId);
  const visibleSiblings = allSiblingsForWeek.filter((c) => c.id !== initialData?.id);
  const [insertAfterId, setInsertAfterId] = useState(() =>
    mode === "edit" && initialData
      ? getCurrentPositionInsertAfterId(initialData.id, allSiblingsForWeek)
      : getDefaultInsertAfterId(allSiblingsForWeek)
  );
  // Omit insert_after_id from the PUT body when neither week nor position was touched (the server
  // then leaves display order alone).
  const initialInsertAfterId = useRef(insertAfterId);

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
  // Only the object key is stored (#89). Legacy public URLs are normalized to a key; unnormalizable
  // values become empty, but requiresSlidePdf (initialData.pdf_url truthy) blocks saving until
  // re-upload, so values never vanish silently.
  const initialPdfKey = toSlideObjectKey(initialData?.pdf_url);
  const initialSlide = parseSlideObjectKey(initialPdfKey);
  const [pdfUrl, setPdfUrl] = useState(initialPdfKey ?? "");
  const [pdfFolder, setPdfFolder] = useState(initialSlide?.folder ?? "");
  const [slideNumber, setSlideNumber] = useState(
    initialSlide ? String(initialSlide.slideNumber) : ""
  );
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [isOpenToTrial, setIsOpenToTrial] = useState(initialData?.is_open_to_trial ?? false);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(initialPdfKey);

  const visiblePhases = phases.filter((p) => !themeId || String(p.themeId) === themeId);
  const visiblePhaseIds = new Set(visiblePhases.map((p) => p.id));
  const visibleWeeks = weeks.filter((w) => {
    if (phaseId) return String(w.phaseId) === phaseId;
    if (themeId) return visiblePhaseIds.has(w.phaseId);
    return true;
  });

  function handleThemeChange(value: string) {
    setThemeId(value);
    setPhaseId("");
    setWeekId("");
    setInsertAfterId(null);
  }

  function handlePhaseChange(value: string) {
    setPhaseId(value);
    setWeekId("");
    setInsertAfterId(null);
  }

  function handleWeekChange(value: string) {
    setWeekId(value);
    const newSiblingsForValue = siblingCandidates.filter((c) => String(c.parentId) === value);
    // Re-selecting the original week restores the current position; otherwise clearing the week via
    // the theme/phase selects and picking it again would move the item to the tail.
    if (mode === "edit" && initialData && value === initialWeekId) {
      setInsertAfterId(getCurrentPositionInsertAfterId(initialData.id, newSiblingsForValue));
      return;
    }
    const newVisibleSiblings = newSiblingsForValue.filter((c) => c.id !== initialData?.id);
    setInsertAfterId(getDefaultInsertAfterId(newVisibleSiblings));
  }

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
        setPdfUrl(data.path);
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

  // A slide PDF is required for create and for rows that already have one. Requiring it on every
  // edit would block fixing the title or reverting the type of rows bulk-changed to slide with an
  // empty pdf_url.
  const requiresSlidePdf = mode === "create" || Boolean(initialData?.pdf_url);
  const isSlidePdfMissing = contentType === "slide" && requiresSlidePdf && !pdfUrl.trim();

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Saving with an unfinished/failed upload would store a pdf_url with no object. Guard here too,
    // in case the submit button's disabled condition changes.
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

    const positionUnchanged =
      mode === "edit" && weekId === initialWeekId && insertAfterId === initialInsertAfterId.current;
    const body: Record<string, unknown> = {
      title,
      week_id: Number(weekId),
      content_type: contentType,
      insert_after_id: positionUnchanged ? undefined : insertAfterId,
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
        const data: unknown = await response.json().catch(() => null);
        const warning = mode === "edit" ? getSlideStorageWarning(data, "update") : null;
        if (warning) {
          // The update itself succeeded; stay on this screen to warn that the old slide PDF
          // remained in Storage (#241).
          setMessage({ type: "error", text: warning });
          // Adopt the saved position as the new baseline so re-saving doesn't resend
          // insert_after_id and trigger renumbering.
          initialInsertAfterId.current = insertAfterId;
          router.refresh();
          return;
        }
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="themeId">テーマ</Label>
              <select
                id="themeId"
                value={themeId}
                onChange={(e) => handleThemeChange(e.target.value)}
                className={SELECT_CLASS_NAME}
              >
                <option value="">すべて</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phaseId">フェーズ</Label>
              <select
                id="phaseId"
                value={phaseId}
                onChange={(e) => handlePhaseChange(e.target.value)}
                className={SELECT_CLASS_NAME}
              >
                <option value="">すべて</option>
                {visiblePhases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weekId">週</Label>
              <select
                id="weekId"
                value={weekId}
                onChange={(e) => handleWeekChange(e.target.value)}
                required
                className={SELECT_CLASS_NAME}
              >
                <option value="">選択してください</option>
                {visibleWeeks.map((week) => (
                  <option key={week.id} value={week.id}>
                    {buildWeekOptionLabel(week, phases, themes, themeId, phaseId)}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
            {/* Changing a row that has a PDF to another type deletes the PDF from Storage (avoids orphans; not restored on revert). Bulk-changed rows keep pdf_url, so decide by pdf_url presence, not the initial type. */}
            {mode === "edit" && Boolean(initialData?.pdf_url) && contentType !== "slide" && (
              <p className="text-xs text-destructive">
                他の種別に変更して保存すると、紐づくスライドPDFはストレージから完全に削除されます。スライドに戻す場合はPDFの再アップロードが必要です。
              </p>
            )}
          </div>

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
                    step={1}
                    max={SLIDE_NUMBER_MAX}
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

          <SiblingOrderField
            siblings={weekId ? visibleSiblings : null}
            insertAfterId={insertAfterId}
            onChange={setInsertAfterId}
            placeholderLabel={mode === "create" ? "ここに追加" : "ここに移動"}
          />

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

          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              <AlertDescription className={message.type === "success" ? "text-success" : ""}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}

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
