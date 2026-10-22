"use client";

import { ImagePlus, Loader2, Save, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_TYPE_FORM_OPTIONS } from "@/app/constants/content";
import { SLIDE_NUMBER_MAX } from "@/app/constants/slides";
import { parseStarterFiles } from "@/app/lib/code-file-inputs";
import {
  contentTypeStoresTextContent,
  type PhaseFilterOption,
  type ThemeFilterOption,
} from "@/app/lib/content-filtering";
import { insertMarkdownAtSelection } from "@/app/lib/content-image-key";
import {
  getGradingRubricVersion,
  getRubricMaxKeyNumber,
  hasGradingRequirements,
  toRubricFormRows,
} from "@/app/lib/grading";
import { previewCapability } from "@/app/lib/html-preview";
import { MANAGE_CONTENTS_TREE_PATH } from "@/app/lib/manage-contents-paths";
import { type QuizQuestionData, QuizQuestionsSchema } from "@/app/lib/quiz";
import { parseSlideObjectKey, toSlideObjectKey } from "@/app/lib/slide-object-key";
import { getSlideStorageWarning } from "@/app/lib/slide-storage-warning";
import { toSubmissionSlotPayload } from "@/app/lib/submission-file-slots";
import type { ContentType, GradingRequirement, LearningContent } from "@/app/types";
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
} from "../../components/SiblingOrderField";
import { GradingRubricEditor } from "./GradingRubricEditor";
import {
  buildInitialSubmissionSlotDrafts,
  SubmissionFileSlotsEditor,
  type SubmissionSlotDraft,
} from "./SubmissionFileSlotsEditor";

/** Untouched flags stay NULL (automatic). An explicit off is kept; an illegal on is dropped. */
export function storedPreviewFlag(
  touched: boolean,
  value: boolean | null,
  allowed: boolean
): boolean | null {
  if (!touched) {
    return null;
  }
  if (value === true) {
    return allowed ? true : null;
  }
  return value === false ? false : null;
}

/** The version just stored, for the rows still on screen. Ignores anything else in the body. */
export function adoptSavedRubricVersion(
  data: unknown,
  versionRef: { current: number | null },
  setVersion: (version: number | null) => void
) {
  if (!data || typeof data !== "object" || !("grading_rubric_version" in data)) {
    return;
  }
  const version = (data as { grading_rubric_version: unknown }).grading_rubric_version;
  if (
    version === null ||
    (typeof version === "number" && Number.isInteger(version) && version > 0)
  ) {
    versionRef.current = version;
    setVersion(version);
  }
}

import {
  createEmptyQuizQuestion,
  type QuizQuestionDraft,
  QuizQuestionsEditor,
  toQuizQuestionDrafts,
  toQuizQuestionPayload,
} from "./QuizQuestionsEditor";

// Module-level so the default does not break the memoized sibling lists.
const NO_SIBLING_CANDIDATES: SiblingCandidate[] = [];

const SELECT_CLASS_NAME =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

interface InitialPhaseSelection {
  themeId?: string;
  phaseId?: string;
}

interface ContentFormProps {
  themes: ThemeFilterOption[];
  phases: PhaseFilterOption[];
  initialData?: LearningContent;
  /** Stored questions (with answers) for a quiz in edit mode. */
  initialQuizQuestions?: QuizQuestionData[];
  /**
   * The stored questions could not be read (edit mode, non-quiz content). Switching to quiz is
   * disabled: the editor would start empty and saving would replace the stored questions.
   */
  quizQuestionsUnavailable?: boolean;
  initialPhaseSelection?: InitialPhaseSelection;
  /**
   * Includes the target itself in edit mode so its current position can be found; filtered out in
   * the form before display.
   */
  siblingCandidates?: SiblingCandidate[];
  mode: "create" | "edit";
  /** Dialog embedding: close and expand the created/updated node instead of navigating away. */
  onSuccess?: (result?: { id: number }) => void;
  onCancel?: () => void;
  /** Skip Card chrome so the form sits cleanly inside a Dialog. */
  embedded?: boolean;
  /** Where to go after save/cancel when not embedded (bulk tab vs tree). */
  returnPath?: string;
}

function parseCreatedContentId(data: unknown): number | undefined {
  if (!data || typeof data !== "object" || !("content" in data)) return undefined;
  const id = (data as { content?: { id?: unknown } }).content?.id;
  return typeof id === "number" ? id : undefined;
}

/**
 * Reverse-lookup of the theme from a phase id. If the phase is missing from the options
 * (unclassified/deleted), skip theme preselection but keep the phase value so it can be re-saved.
 */
function resolvePhaseSelection(
  phaseId: string,
  phases: PhaseFilterOption[]
): { themeId: string; phaseId: string } {
  const phase = phaseId ? phases.find((p) => String(p.id) === phaseId) : undefined;
  return { themeId: phase ? String(phase.themeId) : "", phaseId };
}

/**
 * Labels include the unfiltered parent name because a phase can be picked without choosing a
 * theme; this disambiguates same-named phases.
 */
function buildPhaseOptionLabel(
  phase: PhaseFilterOption,
  themes: ThemeFilterOption[],
  themeId: string
): string {
  if (themeId) return phase.name;

  const theme = themes.find((t) => t.id === phase.themeId);
  return theme ? `${theme.name} / ${phase.name}` : phase.name;
}

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

/** Not a valid folder name (underscores are rejected by SLIDE_FOLDER_PATTERN), so it can't collide. */
const NEW_FOLDER_OPTION = "__new__";

export function ContentForm({
  themes,
  phases,
  initialData,
  initialQuizQuestions = [],
  quizQuestionsUnavailable = false,
  initialPhaseSelection,
  siblingCandidates = NO_SIBLING_CANDIDATES,
  mode,
  onSuccess,
  onCancel,
  embedded = false,
  returnPath = MANAGE_CONTENTS_TREE_PATH,
}: ContentFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textContentRef = useRef<HTMLTextAreaElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialData?.title ?? "");

  // Edit mode keeps initialData.phase_id even if it is not in the options so saving doesn't clobber
  // it. Create mode adopts the query-derived selection only when the phase exists; otherwise the
  // form would look unselected yet be submittable.
  const initialPhaseIdValue =
    mode === "edit"
      ? (initialData?.phase_id?.toString() ?? "")
      : phases.some((p) => String(p.id) === initialPhaseSelection?.phaseId)
        ? (initialPhaseSelection?.phaseId ?? "")
        : "";
  const resolvedInitialSelection = resolvePhaseSelection(initialPhaseIdValue, phases);
  const initialThemeIdFallback =
    mode === "create" && themes.some((t) => String(t.id) === initialPhaseSelection?.themeId)
      ? (initialPhaseSelection?.themeId ?? "")
      : "";

  const [themeId, setThemeId] = useState(
    resolvedInitialSelection.themeId || initialThemeIdFallback
  );
  const initialPhaseId = resolvedInitialSelection.phaseId;
  const [phaseId, setPhaseId] = useState(initialPhaseId);
  const allSiblingsForPhase = useMemo(
    () => siblingCandidates.filter((c) => String(c.parentId) === phaseId),
    [siblingCandidates, phaseId]
  );
  // Referentially stable across keystrokes: SiblingOrderField is memoized on this array.
  const visibleSiblings = useMemo(
    () => allSiblingsForPhase.filter((c) => c.id !== initialData?.id),
    [allSiblingsForPhase, initialData?.id]
  );
  const [insertAfterId, setInsertAfterId] = useState(() =>
    mode === "edit" && initialData
      ? getCurrentPositionInsertAfterId(initialData.id, allSiblingsForPhase)
      : getDefaultInsertAfterId(allSiblingsForPhase)
  );
  // Omit insert_after_id from the PUT body when neither phase nor position was touched (the server
  // then leaves display order alone).
  const initialInsertAfterId = useRef(insertAfterId);

  const [contentType, setContentType] = useState<ContentType>(initialData?.content_type ?? "video");
  // True once this form has shown the slide article field, so leaving slide can warn before the
  // article is cleared. Text-only rows stay false and keep the previous (no warning) behavior.
  const [slideArticleAttached, setSlideArticleAttached] = useState(
    initialData?.content_type === "slide"
  );
  const [videoUrl, setVideoUrl] = useState(initialData?.video_url ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [textContent, setTextContent] = useState(initialData?.text_content ?? "");
  const [exerciseInstructions, setExerciseInstructions] = useState(
    initialData?.exercise_instructions ?? ""
  );
  const [hint, setHint] = useState(initialData?.hint ?? "");
  const [referenceAnswer, setReferenceAnswer] = useState(initialData?.reference_answer ?? "");
  const [rubricRows, setRubricRows] = useState<GradingRequirement[]>(() =>
    toRubricFormRows(initialData?.grading_rubric)
  );
  // The version that belongs to rubricRows. A refresh can replace initialData with a newer rubric
  // while these rows stay, so reading the prop at submit time would lock the old rows with the
  // newer version and overwrite that save.
  const [loadedRubricVersion, setLoadedRubricVersion] = useState<number | null>(() =>
    mode === "edit" ? getGradingRubricVersion(initialData?.grading_rubric) : null
  );
  const loadedRubricVersionRef = useRef(loadedRubricVersion);
  // A deleted rubric (#344) has a version for the optimistic lock, but it is not a rubric: the
  // editor shows a version only for a live one.
  const [rubricIsLive, setRubricIsLive] = useState(() =>
    hasGradingRequirements(initialData?.grading_rubric)
  );
  const [issuedMaxKeyNumber] = useState(() => getRubricMaxKeyNumber(initialData?.grading_rubric));
  const [allowedSubmissionTypes, setAllowedSubmissionTypes] = useState<AllowedSubmissionTypes>(
    (initialData?.allowed_submission_types as AllowedSubmissionTypes) ?? "code"
  );
  const [submissionSlots, setSubmissionSlots] = useState<SubmissionSlotDraft[]>(() =>
    buildInitialSubmissionSlotDrafts({
      submissionFileSlots: initialData?.submission_file_slots,
      starterFiles: parseStarterFiles(initialData?.starter_files),
      codeLanguage: initialData?.code_language,
    })
  );
  // NULL stays automatic and follows the layout. A saved boolean is kept until the layout makes
  // that "on" illegal (same idea as a filename the admin already edited).
  const [showPreview, setShowPreview] = useState<boolean | null>(initialData?.show_preview ?? null);
  const [showConsole, setShowConsole] = useState<boolean | null>(initialData?.show_console ?? null);
  const [previewBaseHtml, setPreviewBaseHtml] = useState(initialData?.preview_base_html ?? "");
  const [previewFlagsTouched, setPreviewFlagsTouched] = useState(
    () => initialData?.show_preview != null || initialData?.show_console != null
  );
  // Only the object key is stored (#89). Legacy public URLs are normalized to a key; unnormalizable
  // values become empty, but requiresSlidePdf (initialData.pdf_url truthy) blocks saving until
  // re-upload, so values never vanish silently.
  const initialPdfKey = toSlideObjectKey(initialData?.pdf_url);
  const initialSlide = parseSlideObjectKey(initialPdfKey);
  const [pdfUrl, setPdfUrl] = useState(initialPdfKey ?? "");
  const [pdfFolder, setPdfFolder] = useState(initialSlide?.folder ?? "");
  // Existing folders come from the slides bucket; a new one is created only via NEW_FOLDER_OPTION
  // plus an explicit confirmation, so a typo can't silently open a folder (#440).
  const [existingFolders, setExistingFolders] = useState<string[]>([]);
  const [folderListState, setFolderListState] = useState<"loading" | "ready" | "error">("loading");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderConfirmed, setNewFolderConfirmed] = useState(false);
  const [slideNumber, setSlideNumber] = useState(
    initialSlide ? String(initialSlide.slideNumber) : ""
  );
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionDraft[]>(() =>
    initialQuizQuestions.length > 0
      ? toQuizQuestionDrafts(initialQuizQuestions)
      : [createEmptyQuizQuestion()]
  );
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [isOpenToTrial, setIsOpenToTrial] = useState(initialData?.is_open_to_trial ?? false);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Set when a create succeeded but publishing failed: the draft exists, so the form must not be
  // submitted again (that would create a second copy); the admin publishes it from its edit page.
  const [createdDraftId, setCreatedDraftId] = useState<number | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(initialPdfKey);

  const phaseOptions = useMemo(
    () =>
      phases
        .filter((p) => !themeId || String(p.themeId) === themeId)
        .map((phase) => ({
          id: phase.id,
          label: buildPhaseOptionLabel(phase, themes, themeId),
        })),
    [phases, themes, themeId]
  );

  function handleThemeChange(value: string) {
    setThemeId(value);
    setPhaseId("");
    setInsertAfterId(null);
  }

  function handlePhaseChange(value: string) {
    setPhaseId(value);
    const newSiblingsForValue = siblingCandidates.filter((c) => String(c.parentId) === value);
    // Re-selecting the original phase restores the current position; otherwise clearing the phase
    // via the theme select and picking it again would move the item to the tail.
    if (mode === "edit" && initialData && value === initialPhaseId) {
      setInsertAfterId(getCurrentPositionInsertAfterId(initialData.id, newSiblingsForValue));
      return;
    }
    const newVisibleSiblings = newSiblingsForValue.filter((c) => c.id !== initialData?.id);
    setInsertAfterId(getDefaultInsertAfterId(newVisibleSiblings));
  }

  const isCreatingFolder = pdfFolder === NEW_FOLDER_OPTION;
  const selectedFolder = isCreatingFolder ? newFolderName.trim().toLowerCase() : pdfFolder;
  // A saved folder missing from the listing (e.g. an empty folder) must stay selectable.
  const folderOptions = useMemo(() => {
    const names = new Set(existingFolders);
    if (initialSlide?.folder) names.add(initialSlide.folder);
    return [...names].sort();
  }, [existingFolders, initialSlide?.folder]);

  useEffect(() => {
    if (contentType !== "slide") return;
    let cancelled = false;
    setFolderListState("loading");
    fetch("/api/upload-pdf")
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as { folders?: string[] };
        if (!cancelled) {
          setExistingFolders(data.folders ?? []);
          setFolderListState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setFolderListState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [contentType]);

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setMessage({ type: "error", text: "PDFファイルのみアップロード可能です" });
      return;
    }

    const folder = selectedFolder;
    if (!folder) {
      setMessage({
        type: "error",
        text: isCreatingFolder
          ? "新しいフォルダ名を入力してください"
          : "保存先フォルダを選択してください",
      });
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
    if (isCreatingFolder && !newFolderConfirmed) {
      setMessage({ type: "error", text: "新しいフォルダを作成する確認にチェックしてください" });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    if (isCreatingFolder && existingFolders.includes(folder)) {
      setMessage({
        type: "error",
        text: "同名のフォルダが既に存在します。一覧から選択してください",
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
      if (isCreatingFolder) {
        formData.append("createFolder", "true");
      }
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
        if (isCreatingFolder) {
          // The folder now exists: switch to plain selection so later uploads need no confirmation.
          setExistingFolders((prev) => [...new Set([...prev, folder])]);
          setPdfFolder(folder);
          setNewFolderName("");
          setNewFolderConfirmed(false);
        }
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

  // Images are keyed by content id; upload only after the row exists (edit mode).
  const canUploadContentImage = mode === "edit" && Boolean(initialData?.id);

  const handleContentImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !initialData?.id) {
      return;
    }

    setIsUploadingImage(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contentId", String(initialData.id));

      const response = await fetch("/api/upload-content-image", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { path?: string; error?: string };
      if (!response.ok || !data.path) {
        setMessage({ type: "error", text: data.error || "画像のアップロードに失敗しました" });
        return;
      }

      const textarea = textContentRef.current;
      const selectionStart = textarea?.selectionStart ?? textContent.length;
      const selectionEnd = textarea?.selectionEnd ?? selectionStart;
      const markdown = `![画像](${data.path})`;
      const { next, caret } = insertMarkdownAtSelection(
        textContent,
        selectionStart,
        selectionEnd,
        markdown
      );
      setTextContent(next);
      // Restore caret after React applies the new value.
      requestAnimationFrame(() => {
        const el = textContentRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
      setMessage({ type: "success", text: "画像を挿入しました" });
    } catch {
      setMessage({ type: "error", text: "画像のアップロード中にエラーが発生しました" });
    } finally {
      setIsUploadingImage(false);
      if (imageFileInputRef.current) {
        imageFileInputRef.current.value = "";
      }
    }
  };

  // A slide PDF is required for create and for rows that already have one. Requiring it on every
  // edit would block fixing the title or reverting the type of rows bulk-changed to slide with an
  // empty pdf_url.
  const requiresSlidePdf = mode === "create" || Boolean(initialData?.pdf_url);
  const isSlidePdfMissing = contentType === "slide" && requiresSlidePdf && !pdfUrl.trim();
  const previewCap = previewCapability(
    submissionSlots.map((slot) => ({ filename: slot.filename, language: slot.language })),
    { previewBaseHtml }
  );

  // Stable identity so the memoized SubmissionFileSlotsEditor skips re-rendering on unrelated
  // keystrokes; it must change with previewBaseHtml / previewFlagsTouched, which it reads.
  const handleSubmissionSlotsChange = useCallback(
    (next: SubmissionSlotDraft[]) => {
      setSubmissionSlots(next);
      if (!previewFlagsTouched) {
        return;
      }
      const nextCap = previewCapability(
        next.map((slot) => ({ filename: slot.filename, language: slot.language })),
        { previewBaseHtml }
      );
      setShowPreview((current) => (current === true && !nextCap.previewAllowed ? null : current));
      setShowConsole((current) => (current === true && !nextCap.consoleAllowed ? null : current));
    },
    [previewFlagsTouched, previewBaseHtml]
  );

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
    if (contentType === "exercise" && rubricRows.some((row) => !row.name.trim())) {
      setMessage({
        type: "error",
        text: "採点基準の要件名を入力するか、空の要件を削除してください",
      });
      return;
    }

    const slotPayload =
      contentType === "exercise" ? toSubmissionSlotPayload(submissionSlots) : null;
    if (slotPayload && !slotPayload.ok) {
      setMessage({ type: "error", text: slotPayload.error });
      return;
    }

    // Validate with the same schema as the API so choice counts and correct answers are reported
    // per question before sending.
    let validatedQuizQuestions: QuizQuestionData[] | undefined;
    if (contentType === "quiz") {
      const parsed = QuizQuestionsSchema.safeParse(toQuizQuestionPayload(quizQuestions));
      if (!parsed.success) {
        const text = parsed.error.issues
          .map((issue) => {
            const questionIndex = issue.path[0];
            return typeof questionIndex === "number"
              ? `設問${questionIndex + 1}: ${issue.message}`
              : issue.message;
          })
          .join(" / ");
        setMessage({ type: "error", text });
        return;
      }
      validatedQuizQuestions = parsed.data;
    }

    setIsLoading(true);
    setMessage(null);

    const positionUnchanged =
      mode === "edit" &&
      phaseId === initialPhaseId &&
      insertAfterId === initialInsertAfterId.current;
    const body: Record<string, unknown> = {
      title,
      phase_id: Number(phaseId),
      content_type: contentType,
      insert_after_id: positionUnchanged ? undefined : insertAfterId,
      is_published: isPublished,
      is_open_to_trial: isOpenToTrial,
      video_url: contentType === "video" ? videoUrl.trim() || null : null,
      description:
        contentType === "video" || contentType === "slide" || contentType === "quiz"
          ? description.trim() || null
          : null,
      text_content: contentTypeStoresTextContent(contentType) ? textContent.trim() || null : null,
      exercise_instructions:
        contentType === "exercise" ? exerciseInstructions.trim() || null : null,
      hint: contentType === "exercise" ? hint.trim() || null : null,
      reference_answer: contentType === "exercise" ? referenceAnswer.trim() || null : null,
      starter_files: slotPayload?.ok ? slotPayload.starterFiles : null,
      submission_file_slots: slotPayload?.ok ? slotPayload.slots : null,
      preview_base_html: contentType === "exercise" ? previewBaseHtml.trim() || null : null,
      show_preview:
        contentType === "exercise"
          ? storedPreviewFlag(previewFlagsTouched, showPreview, previewCap.previewAllowed)
          : null,
      show_console:
        contentType === "exercise"
          ? storedPreviewFlag(previewFlagsTouched, showConsole, previewCap.consoleAllowed)
          : null,
      allowed_submission_types: contentType === "exercise" ? allowedSubmissionTypes : "code",
      code_language:
        contentType === "exercise"
          ? slotPayload?.ok
            ? slotPayload.codeLanguage
            : "javascript"
          : "javascript",
      pdf_url: contentType === "slide" ? pdfUrl.trim() || null : null,
      // No rows clears the rubric. The server derives the version and bumps it only when the
      // requirements actually changed.
      grading_rubric:
        contentType === "exercise" && rubricRows.length > 0 ? { requirements: rubricRows } : null,
      // The version this form loaded, not the version to store. A save opened on an older
      // version is rejected instead of being written on top of a newer rubric.
      grading_rubric_version: mode === "edit" ? loadedRubricVersionRef.current : undefined,
      quiz_questions: validatedQuizQuestions,
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
        if (mode === "edit") {
          adoptSavedRubricVersion(data, loadedRubricVersionRef, setLoadedRubricVersion);
          setRubricIsLive(contentType === "exercise" && rubricRows.length > 0);
        }
        const createWarning =
          mode === "create" && data && typeof data === "object" && "warning" in data
            ? String((data as { warning: unknown }).warning)
            : null;
        if (createWarning) {
          // Stay on the form (even when embedded) so the edit link can be shown; do not call
          // onSuccess — the parent would close the dialog before the warning is read.
          const createdId = (data as { content?: { id?: unknown } }).content?.id;
          setMessage({ type: "error", text: createWarning });
          setCreatedDraftId(typeof createdId === "number" ? createdId : null);
          router.refresh();
          return;
        }
        const warning = mode === "edit" ? getSlideStorageWarning(data, "update") : null;
        if (warning) {
          // The update itself succeeded; stay on this screen to warn that the old slide PDF
          // remained in Storage (#241). Do not call onSuccess for the same reason as createWarning.
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
        const id = mode === "edit" && initialData ? initialData.id : parseCreatedContentId(data);
        if (onSuccess) {
          // Caller (e.g. ContentTree) refreshes after expanding the created node.
          onSuccess(id !== undefined ? { id } : undefined);
        } else {
          router.push(returnPath);
          router.refresh();
        }
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

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    router.push(returnPath);
  };

  const fields = (
    <>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            required
            className={SELECT_CLASS_NAME}
          >
            <option value="">選択してください</option>
            {phaseOptions.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>コンテンツ種別</Label>
        <div className="flex flex-wrap gap-2">
          {CONTENT_TYPE_FORM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                if (opt.value === "slide" || contentType === "slide") {
                  setSlideArticleAttached(true);
                }
                setContentType(opt.value);
              }}
              disabled={opt.value === "quiz" && quizQuestionsUnavailable}
              className={`min-w-24 flex-1 rounded-lg border-2 px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                contentType === opt.value
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {quizQuestionsUnavailable && (
          <p className="text-xs text-muted-foreground">
            保存済みのクイズの設問を読み込めなかったため、クイズへの種別変更はできません。時間をおいて再度お試しください。
          </p>
        )}
        {/* Changing a row that has a PDF to another type deletes the PDF from Storage (avoids orphans; not restored on revert). Bulk-changed rows keep pdf_url, so decide by pdf_url presence, not the initial type. */}
        {mode === "edit" && Boolean(initialData?.pdf_url) && contentType !== "slide" && (
          <p className="text-xs text-destructive">
            他の種別に変更して保存すると、紐づくスライドPDFはストレージから完全に削除されます。スライドに戻す場合はPDFの再アップロードが必要です。
          </p>
        )}
        {slideArticleAttached &&
          textContent.trim() &&
          !contentTypeStoresTextContent(contentType) && (
            <p className="text-xs text-destructive">
              テキストとスライド以外の種別に変更して保存すると、解説記事は削除されます。
            </p>
          )}
      </div>

      {(contentType === "video" || contentType === "slide" || contentType === "quiz") && (
        <div className="space-y-2">
          <Label htmlFor="description">
            {contentType === "quiz" ? "導入文（Markdown・任意）" : "概要（Markdown・任意）"}
          </Label>
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

      {contentType === "slide" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pdfFolder">保存先フォルダ（コーススラッグ）</Label>
              <select
                id="pdfFolder"
                value={pdfFolder}
                onChange={(e) => {
                  setPdfFolder(e.target.value);
                  setNewFolderConfirmed(false);
                }}
                disabled={folderListState === "loading"}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">
                  {folderListState === "loading" ? "読み込み中..." : "フォルダを選択"}
                </option>
                {folderOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value={NEW_FOLDER_OPTION}>新しいフォルダを作成…</option>
              </select>
              {folderListState === "error" && (
                <p className="text-xs text-destructive">
                  フォルダ一覧を取得できませんでした。ページを再読み込みしてください。
                </p>
              )}
              {isCreatingFolder && (
                <div className="space-y-2">
                  <Input
                    value={newFolderName}
                    onChange={(e) => {
                      setNewFolderName(e.target.value);
                      setNewFolderConfirmed(false);
                    }}
                    placeholder="例: gas-advanced"
                    aria-label="新しいフォルダ名"
                  />
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={newFolderConfirmed}
                      onChange={(e) => setNewFolderConfirmed(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      新しいフォルダ「{selectedFolder || "（未入力）"}
                      」を作成します。既存コースの綴り違いではないことを確認しました
                    </span>
                  </label>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                slides/&lt;フォルダ&gt;/slide-NN.pdf として保存されます（英小文字・数字・ハイフン）
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

      {(contentType === "text" || contentType === "slide") && (
        <div className="space-y-2">
          <Label htmlFor="textContent">
            {contentType === "slide" ? "解説記事（Markdown・任意）" : "テキスト（Markdown）"}
          </Label>
          <Textarea
            id="textContent"
            ref={textContentRef}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder={
              contentType === "slide"
                ? "スライドの補足をMarkdownで記述してください。未入力の場合は表示しません。"
                : "Markdown形式で記述してください..."
            }
            className="min-h-[300px] font-mono"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => imageFileInputRef.current?.click()}
              disabled={!canUploadContentImage || isUploadingImage}
            >
              {isUploadingImage ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              {isUploadingImage ? "アップロード中..." : "画像を挿入"}
            </Button>
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleContentImageSelect}
            />
            <p className="text-xs text-muted-foreground">
              {canUploadContentImage
                ? "PNG / JPEG / WebP / GIF（5MB以下）。カーソル位置に Markdown を挿入します。"
                : "画像の挿入はコンテンツ保存後の編集画面から行えます。"}
            </p>
          </div>
          {contentType === "slide" && (
            <p className="text-xs text-muted-foreground">
              スライドの下に表示します。画像は
              {` {{SUPABASE_STORAGE_URL}}/content-images/... `}
              で参照できます。
            </p>
          )}
        </div>
      )}

      {contentType === "quiz" && (
        <QuizQuestionsEditor questions={quizQuestions} onChange={setQuizQuestions} />
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
            <Label htmlFor="referenceAnswer">
              模範回答（AIレビュー採点基準・提出後に受講生へ表示）
            </Label>
            <Textarea
              id="referenceAnswer"
              value={referenceAnswer}
              onChange={(e) => setReferenceAnswer(e.target.value)}
              placeholder="模範回答を記述してください。AIレビュー時の採点基準として使用され、受講生には提出後に表示されます（提出前は非公開）。"
              className="min-h-[200px] font-mono"
            />
          </div>
          <GradingRubricEditor
            rows={rubricRows}
            onChange={setRubricRows}
            currentVersion={rubricIsLive ? loadedRubricVersion : null}
            issuedMaxKeyNumber={issuedMaxKeyNumber}
            exerciseInstructions={exerciseInstructions}
            referenceAnswer={referenceAnswer}
          />
          <div className="space-y-2">
            <Label>提出ファイル</Label>
            <p className="text-xs text-muted-foreground">
              受講生にはこの行数の入力欄が最初から出ます。ファイル名と言語は変えられず、空のファイルは提出できません。1行目の言語が演習のコード言語として保存されます。ファイル名を言語の既定（例:
              code.js）の1件だけにすると構成は未指定として保存され、既存の演習と同じ単一ファイルになります。初期コードを空にすると、提出フォームは空欄から始まります。
            </p>
            <SubmissionFileSlotsEditor
              slots={submissionSlots}
              onChange={handleSubmissionSlotsChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="previewBaseHtml">プレビューの土台 HTML（CSS 単独用）</Label>
            <p className="text-xs text-muted-foreground">
              CSS だけの提出でプレビューするとき、ここに装飾対象の HTML
              を置きます。受講生は提出しません。未設定のままでは CSS 単独のプレビューは出せません。
            </p>
            <Textarea
              id="previewBaseHtml"
              value={previewBaseHtml}
              onChange={(e) => {
                setPreviewBaseHtml(e.target.value);
                if (!previewFlagsTouched) {
                  return;
                }
                const nextCap = previewCapability(
                  submissionSlots.map((slot) => ({
                    filename: slot.filename,
                    language: slot.language,
                  })),
                  { previewBaseHtml: e.target.value }
                );
                setShowPreview((current) =>
                  current === true && !nextCap.previewAllowed ? null : current
                );
              }}
              placeholder={'<div class="box">...</div>'}
              className="min-h-[120px] font-mono text-sm"
            />
          </div>
          <div className="space-y-3">
            <Label>ブラウザでの表示</Label>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  id="showPreview"
                  type="checkbox"
                  checked={previewCap.previewAllowed && (showPreview ?? previewCap.autoPreview)}
                  disabled={!previewCap.previewAllowed}
                  onChange={(e) => {
                    setPreviewFlagsTouched(true);
                    setShowPreview(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-input disabled:opacity-50"
                />
                <Label htmlFor="showPreview">プレビューを表示</Label>
              </div>
              <p className="ml-6 text-xs text-muted-foreground">
                {previewCap.previewAllowed
                  ? "HTML を含む課題、または App.jsx / App.js を含む React 構成で、提出内容をブラウザに表示します。"
                  : "HTML を含む構成、または App.jsx / App.js を含む React 構成（.jsx / .js / .css のみ）のときだけオンにできます。"}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  id="showConsole"
                  type="checkbox"
                  checked={previewCap.consoleAllowed && (showConsole ?? previewCap.autoConsole)}
                  disabled={!previewCap.consoleAllowed}
                  onChange={(e) => {
                    setPreviewFlagsTouched(true);
                    setShowConsole(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-input disabled:opacity-50"
                />
                <Label htmlFor="showConsole">コンソールを表示</Label>
              </div>
              <p className="ml-6 text-xs text-muted-foreground">
                {previewCap.consoleAllowed
                  ? previewCap.autoPreview
                    ? "スクリプトの出力とエラーをプレビューの下に出します。"
                    : "プレビュー枠は出さず、「実行」を押したときだけ動きます。"
                  : "HTML・JavaScript・または React（App.jsx / App.js）構成で、ほかの言語を含まないときだけオンにできます。"}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>提出方法</Label>
            <div className="flex flex-wrap gap-2">
              {SUBMISSION_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAllowedSubmissionTypes(opt.value)}
                  className={`min-w-40 flex-1 rounded-lg border-2 px-3 py-2 text-left text-sm transition-colors ${
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
        siblings={phaseId ? visibleSiblings : null}
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
            {createdDraftId !== null && (
              <>
                {" "}
                <Link href={`/manage/contents/${createdDraftId}/edit`} className="underline">
                  編集画面を開く
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={
            isLoading ||
            isUploading ||
            !title ||
            !phaseId ||
            isSlidePdfMissing ||
            createdDraftId !== null
          }
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === "create" ? "作成" : "更新"}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel}>
          キャンセル
        </Button>
      </div>
    </>
  );

  return (
    <form onSubmit={handleSubmit}>
      {embedded ? (
        <div className="space-y-6">{fields}</div>
      ) : (
        <Card>
          <CardContent className="space-y-6 pt-6">{fields}</CardContent>
        </Card>
      )}
    </form>
  );
}
