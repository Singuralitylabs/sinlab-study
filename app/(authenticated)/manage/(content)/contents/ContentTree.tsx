"use client";

import { ChevronDown, ChevronRight, Edit, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ContentTypeIcon } from "@/app/components/ContentTypeIcon";
import { CONTENT_TYPE_LABELS } from "@/app/constants/content";
import type { PhaseFilterOption, ThemeFilterOption } from "@/app/lib/content-filtering";
import {
  type ContentTreeExpandTarget,
  type ContentTreeThemeNode,
  contentTreeNodeKey,
  expandKeysForTarget,
} from "@/app/lib/content-tree";
import type { ManageThemeListItem } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SiblingCandidate, SiblingOrderItem } from "../../components/SiblingOrderField";
import { PhaseForm } from "../phases/PhaseForm";
import { ThemeForm } from "../themes/ThemeForm";
import { ContentForm } from "./ContentForm";

type CreateDialogKind = "theme" | "phase" | "content" | null;

type CreateDialogState = {
  kind: CreateDialogKind;
  themeId?: number;
  phaseId?: number;
};

type ContentTreeProps = {
  tree: ContentTreeThemeNode[];
  themes: ManageThemeListItem[];
  themeSiblings: SiblingOrderItem[];
  phaseSiblingCandidates: SiblingCandidate[];
  contentSiblingCandidates: SiblingCandidate[];
  contentFormThemes: ThemeFilterOption[];
  contentFormPhases: PhaseFilterOption[];
  /** Expand these keys after a create (from sessionStorage or server hint). */
  initialExpandKeys?: string[];
  formDataReady: {
    themes: boolean;
    phases: boolean;
    contents: boolean;
  };
};

const EXPAND_STORAGE_KEY = "manage-content-tree-expand";
/** Stable default so a new `[]` is not allocated every render (would retrigger effects). */
const NO_EXPAND_KEYS: string[] = [];

function PublishedBadge({ isPublished }: { isPublished: boolean }) {
  return (
    <Badge variant={isPublished ? "default" : "secondary"} className="shrink-0">
      {isPublished ? "公開" : "非公開"}
    </Badge>
  );
}

function readStoredExpandKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(EXPAND_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function storeExpandKeys(keys: string[]) {
  try {
    sessionStorage.setItem(EXPAND_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // sessionStorage may be unavailable; expand state is best-effort.
  }
}

export function ContentTree({
  tree,
  themes,
  themeSiblings,
  phaseSiblingCandidates,
  contentSiblingCandidates,
  contentFormThemes,
  contentFormPhases,
  initialExpandKeys = NO_EXPAND_KEYS,
  formDataReady,
}: ContentTreeProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialExpandKeys));
  const [dialog, setDialog] = useState<CreateDialogState>({ kind: null });

  // Mount-only: merge sessionStorage after hydration. Do not depend on initialExpandKeys — the
  // default `[]` is a new array each render and would re-run forever once storage is non-empty.
  useEffect(() => {
    const stored = readStoredExpandKeys();
    if (stored.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const key of stored) {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const dialogOpen = dialog.kind !== null;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      storeExpandKeys([...next]);
      return next;
    });
  }

  function openCreate(state: CreateDialogState) {
    setDialog(state);
  }

  function closeDialog() {
    setDialog({ kind: null });
  }

  function handleCreated(target: ContentTreeExpandTarget) {
    const keys = expandKeysForTarget(target);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.add(key);
      storeExpandKeys([...next]);
      return next;
    });
    closeDialog();
    router.refresh();
  }

  const dialogTitle = useMemo(() => {
    switch (dialog.kind) {
      case "theme":
        return "テーマを追加";
      case "phase":
        return "フェーズを追加";
      case "content":
        return "コンテンツを追加";
      default:
        return "";
    }
  }, [dialog.kind]);

  const selectedTheme = dialog.themeId != null ? tree.find((t) => t.id === dialog.themeId) : null;
  const selectedPhase =
    selectedTheme && dialog.phaseId != null
      ? selectedTheme.phases.find((p) => p.id === dialog.phaseId)
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        {tree.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            テーマがまだありません。「＋テーマを追加」から作成してください。
          </p>
        ) : (
          <ul className="divide-y">
            {tree.map((theme) => {
              const themeKey = contentTreeNodeKey("theme", theme.id);
              const themeOpen = expanded.has(themeKey);
              return (
                <li key={theme.id} className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm font-semibold min-w-0"
                      onClick={() => toggle(themeKey)}
                      aria-expanded={themeOpen}
                    >
                      {themeOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">{theme.name}</span>
                    </button>
                    <PublishedBadge isPublished={theme.isPublished} />
                    <div className="flex flex-wrap gap-1 ml-auto">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/manage/themes/${theme.id}/edit`}>
                          <Edit className="h-3.5 w-3.5" />
                          編集
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        title="削除"
                        className="text-destructive hover:text-destructive"
                      >
                        <Link href={`/manage/themes/${theme.id}/delete`}>
                          <Trash2 className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openCreate({ kind: "phase", themeId: theme.id })}
                        disabled={!formDataReady.phases}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        フェーズ
                      </Button>
                    </div>
                  </div>

                  {themeOpen && (
                    <ul className="mt-3 ml-2 sm:ml-4 space-y-3 border-l pl-3 sm:pl-4">
                      {theme.phases.map((phase) => {
                        const phaseKey = contentTreeNodeKey("phase", phase.id);
                        const phaseOpen = expanded.has(phaseKey);
                        return (
                          <li key={phase.id}>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-sm font-medium min-w-0"
                                onClick={() => toggle(phaseKey)}
                                aria-expanded={phaseOpen}
                              >
                                {phaseOpen ? (
                                  <ChevronDown className="h-4 w-4 shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 shrink-0" />
                                )}
                                <span className="truncate">{phase.name}</span>
                              </button>
                              <PublishedBadge isPublished={phase.isPublished} />
                              <div className="flex flex-wrap gap-1 ml-auto">
                                <Button asChild variant="outline" size="sm">
                                  <Link href={`/manage/phases/${phase.id}/edit`}>
                                    <Edit className="h-3.5 w-3.5" />
                                    編集
                                  </Link>
                                </Button>
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="icon-sm"
                                  title="削除"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Link href={`/manage/phases/${phase.id}/delete`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Link>
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    openCreate({
                                      kind: "content",
                                      themeId: theme.id,
                                      phaseId: phase.id,
                                    })
                                  }
                                  disabled={!formDataReady.contents}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  コンテンツ
                                </Button>
                              </div>
                            </div>

                            {phaseOpen && (
                              <ul className="mt-2 ml-2 sm:ml-4 space-y-1.5 border-l pl-3 sm:pl-4">
                                {phase.contents.length === 0 ? (
                                  <li className="text-xs text-muted-foreground py-1">
                                    コンテンツはまだありません
                                  </li>
                                ) : (
                                  phase.contents.map((content) => (
                                    <li
                                      key={content.id}
                                      className="flex flex-wrap items-center gap-2 text-sm py-1"
                                    >
                                      <ContentTypeIcon
                                        type={content.contentType}
                                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                      />
                                      <span className="truncate min-w-0">{content.title}</span>
                                      <span className="text-xs text-muted-foreground">
                                        ({CONTENT_TYPE_LABELS[content.contentType]})
                                      </span>
                                      <PublishedBadge isPublished={content.isPublished} />
                                      <Button asChild variant="ghost" size="sm" className="ml-auto">
                                        <Link href={`/manage/contents/${content.id}/edit`}>
                                          <Edit className="h-3.5 w-3.5" />
                                          編集
                                        </Link>
                                      </Button>
                                    </li>
                                  ))
                                )}
                                <li>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground"
                                    onClick={() =>
                                      openCreate({
                                        kind: "content",
                                        themeId: theme.id,
                                        phaseId: phase.id,
                                      })
                                    }
                                    disabled={!formDataReady.contents}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    コンテンツを追加
                                  </Button>
                                </li>
                              </ul>
                            )}
                          </li>
                        );
                      })}
                      <li>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => openCreate({ kind: "phase", themeId: theme.id })}
                          disabled={!formDataReady.phases}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          フェーズを追加
                        </Button>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t p-3 sm:p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => openCreate({ kind: "theme" })}
            disabled={!formDataReady.themes}
          >
            <Plus className="h-4 w-4" />
            テーマを追加
          </Button>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {dialog.kind === "theme" &&
                "新しいテーマを作成します。サムネイルは作成後の編集から設定できます。"}
              {dialog.kind === "phase" &&
                `「${selectedTheme?.name ?? "テーマ"}」の配下にフェーズを追加します。`}
              {dialog.kind === "content" &&
                `「${selectedPhase?.name ?? "フェーズ"}」の配下にコンテンツを追加します。`}
            </DialogDescription>
          </DialogHeader>

          {dialog.kind === "theme" && formDataReady.themes && (
            <ThemeForm
              siblings={themeSiblings}
              mode="create"
              embedded
              onCancel={closeDialog}
              onSuccess={(result) => handleCreated({ themeId: result?.id })}
            />
          )}

          {dialog.kind === "phase" && formDataReady.phases && dialog.themeId != null && (
            <PhaseForm
              themes={themes}
              siblingCandidates={phaseSiblingCandidates}
              mode="create"
              defaultThemeId={String(dialog.themeId)}
              embedded
              onCancel={closeDialog}
              onSuccess={(result) =>
                handleCreated({ themeId: dialog.themeId, phaseId: result?.id })
              }
            />
          )}

          {dialog.kind === "content" && formDataReady.contents && dialog.phaseId != null && (
            <ContentForm
              themes={contentFormThemes}
              phases={contentFormPhases}
              siblingCandidates={contentSiblingCandidates}
              initialPhaseSelection={{
                themeId: dialog.themeId != null ? String(dialog.themeId) : "",
                phaseId: String(dialog.phaseId),
              }}
              mode="create"
              embedded
              onCancel={closeDialog}
              onSuccess={(result) =>
                handleCreated({
                  themeId: dialog.themeId,
                  phaseId: dialog.phaseId,
                  contentId: result?.id,
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
