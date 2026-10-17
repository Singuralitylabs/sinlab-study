"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { LearningWeek, ManagePhaseListItem } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getCurrentPositionInsertAfterId,
  getDefaultInsertAfterId,
  type SiblingCandidate,
  SiblingOrderField,
} from "../../components/SiblingOrderField";

interface WeekFormProps {
  phases: ManagePhaseListItem[];
  initialData?: LearningWeek;
  /**
   * All week candidates for the insert-position picker. Create mode passes the targets themselves;
   * edit mode includes the edited week (to find its current position; removed inside the form
   * before display).
   */
  siblingCandidates?: SiblingCandidate[];
  mode: "create" | "edit";
  /** Pre-select parent phase when creating from the content tree (#335). */
  defaultPhaseId?: string;
  /** Dialog embedding: close and expand the created/updated node instead of navigating away. */
  onSuccess?: (result?: { id: number }) => void;
  onCancel?: () => void;
  /** Skip Card chrome so the form sits cleanly inside a Dialog. */
  embedded?: boolean;
}

function parseCreatedWeekId(data: unknown): number | undefined {
  if (!data || typeof data !== "object" || !("week" in data)) return undefined;
  const id = (data as { week?: { id?: unknown } }).week?.id;
  return typeof id === "number" ? id : undefined;
}

export function WeekForm({
  phases,
  initialData,
  siblingCandidates = [],
  mode,
  defaultPhaseId = "",
  onSuccess,
  onCancel,
  embedded = false,
}: WeekFormProps) {
  const router = useRouter();

  const initialPhaseId = initialData?.phase_id?.toString() ?? defaultPhaseId;
  const [phaseId, setPhaseId] = useState(initialPhaseId);
  const [name, setName] = useState(initialData?.name ?? "");
  const allSiblingsForPhase = siblingCandidates.filter((c) => String(c.parentId) === phaseId);
  const visibleSiblings = allSiblingsForPhase.filter((c) => c.id !== initialData?.id);
  const [insertAfterId, setInsertAfterId] = useState(() =>
    mode === "edit" && initialData
      ? getCurrentPositionInsertAfterId(initialData.id, allSiblingsForPhase)
      : getDefaultInsertAfterId(allSiblingsForPhase)
  );
  // Omit insert_after_id from the PUT body when neither parent nor position was touched (the server
  // leaves display order alone).
  const initialInsertAfterId = useRef(insertAfterId);
  const [isPublished, setIsPublished] = useState(initialData?.is_published ?? false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handlePhaseChange(value: string) {
    setPhaseId(value);
    const newSiblingsForValue = siblingCandidates.filter((c) => String(c.parentId) === value);
    // Re-selecting the original parent restores the current position; otherwise merely touching the
    // parent select would move the item to the tail.
    if (mode === "edit" && initialData && value === initialPhaseId) {
      setInsertAfterId(getCurrentPositionInsertAfterId(initialData.id, newSiblingsForValue));
      return;
    }
    const newVisibleSiblings = newSiblingsForValue.filter((c) => c.id !== initialData?.id);
    setInsertAfterId(getDefaultInsertAfterId(newVisibleSiblings));
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const positionUnchanged =
      mode === "edit" &&
      phaseId === initialPhaseId &&
      insertAfterId === initialInsertAfterId.current;
    const body = {
      phase_id: Number(phaseId),
      name,
      insert_after_id: positionUnchanged ? undefined : insertAfterId,
      is_published: isPublished,
    };

    try {
      const url = mode === "create" ? "/api/manage/weeks" : `/api/manage/weeks/${initialData?.id}`;
      const method = mode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data: unknown = await response.json().catch(() => null);
        setMessage({
          type: "success",
          text: mode === "create" ? "週を作成しました" : "週を更新しました",
        });
        const id = mode === "edit" && initialData ? initialData.id : parseCreatedWeekId(data);
        if (onSuccess) {
          onSuccess(id !== undefined ? { id } : undefined);
          router.refresh();
        } else {
          router.push("/manage/contents");
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
    router.push("/manage/contents");
  };

  const fields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="phaseId">フェーズ</Label>
        <select
          id="phaseId"
          value={phaseId}
          onChange={(e) => handlePhaseChange(e.target.value)}
          required
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">選択してください</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.theme?.name ? `${phase.theme.name} / ` : ""}
              {phase.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">週名</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="週の名前"
          required
        />
      </div>

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

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertDescription className={message.type === "success" ? "text-success" : ""}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isLoading || !name || !phaseId}>
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
