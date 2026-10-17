"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import {
  GRADING_REQUIREMENT_DESCRIPTION_MAX_LENGTH,
  GRADING_REQUIREMENT_NAME_MAX_LENGTH,
  GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS,
  GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS,
  GRADING_RUBRIC_MAX_REQUIREMENTS,
} from "@/app/constants/grading";
import { maxRequirementKeyNumber, nextRequirementKey } from "@/app/lib/grading";
import type { GradingRequirement } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface GradingRubricEditorProps {
  rows: GradingRequirement[];
  onChange: (rows: GradingRequirement[]) => void;
  /**
   * Stored version in edit mode; null when the rubric is unset or the content is new. A deleted
   * rubric (#344) still has one, but it is only shown while there are requirements.
   */
  currentVersion: number | null;
  /** Highest `r{n}` number already issued for the stored rubric; 0 for a new rubric. */
  issuedMaxKeyNumber: number;
  exerciseInstructions: string;
  referenceAnswer: string;
}

export function GradingRubricEditor({
  rows,
  onChange,
  currentVersion,
  issuedMaxKeyNumber,
  exerciseInstructions,
  referenceAnswer,
}: GradingRubricEditorProps) {
  // A ref, not derived from `rows`: deleting or replacing rows during this edit must not free
  // their numbers for new requirements.
  const issuedMaxRef = useRef(issuedMaxKeyNumber);

  function allocateKey(): string {
    const key = nextRequirementKey(
      rows.map((row) => row.key),
      issuedMaxRef.current
    );
    issuedMaxRef.current = maxRequirementKeyNumber([key]);
    return key;
  }

  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const canAdd = rows.length < GRADING_RUBRIC_MAX_REQUIREMENTS;

  function updateRow(index: number, patch: Partial<GradingRequirement>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) {
      return;
    }
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addRow() {
    onChange([...rows, { key: allocateKey(), name: "", description: "" }]);
  }

  async function requestDraft() {
    if (
      rows.length > 0 &&
      !window.confirm("入力中の採点基準を AI の下書きで置き換えます。よろしいですか？")
    ) {
      return;
    }

    setIsDrafting(true);
    setDraftError(null);
    try {
      const response = await fetch("/api/manage/contents/grading-rubric/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise_instructions: exerciseInstructions,
          reference_answer: referenceAnswer || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setDraftError(data?.error ?? "下書きの生成に失敗しました");
        return;
      }

      // Fresh keys: reusing r1.. from the replaced rows would make an old review's key point at a
      // different requirement.
      const drafted: GradingRequirement[] = (
        data.requirements as { name: string; description: string }[]
      ).map((item) => ({ key: allocateKey(), name: item.name, description: item.description }));
      onChange(drafted);
    } catch {
      setDraftError("下書きの生成中にエラーが発生しました");
    } finally {
      setIsDrafting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label>採点基準（AIレビュー・非公開）</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            AIレビューは要件ごとに「達成 / 部分的 / 未達成」を判定し、点数はシステムが計算します。
            未設定の演習は AI が要件を推測する参考採点となり、修了判定には使われません。
            {currentVersion !== null &&
              rows.length > 0 &&
              ` 現在のバージョン: v${currentVersion}（内容を変えて保存すると +1 されます）`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestDraft}
          disabled={isDrafting || !exerciseInstructions.trim()}
          title={exerciseInstructions.trim() ? undefined : "演習指示を入力すると使えます"}
        >
          {isDrafting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          AIで下書き（{GRADING_RUBRIC_DRAFT_MIN_REQUIREMENTS}〜
          {GRADING_RUBRIC_DRAFT_MAX_REQUIREMENTS}件）
        </Button>
      </div>

      {draftError && (
        <Alert variant="destructive">
          <AlertDescription>{draftError}</AlertDescription>
        </Alert>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          採点基準は未設定です。要件を追加するか、AIで下書きを作成してください。
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
              <Input
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
                placeholder="要件名（例: 入力値を検証している）"
                maxLength={GRADING_REQUIREMENT_NAME_MAX_LENGTH}
                aria-label={`要件${index + 1}の名前`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => moveRow(index, -1)}
                disabled={index === 0}
                aria-label="上へ移動"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => moveRow(index, 1)}
                disabled={index === rows.length - 1}
                aria-label="下へ移動"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                aria-label="この要件を削除"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={row.description}
              onChange={(e) => updateRow(index, { description: e.target.value })}
              placeholder="達成 / 部分的 / 未達成を判断する観点"
              maxLength={GRADING_REQUIREMENT_DESCRIPTION_MAX_LENGTH}
              className="min-h-[72px]"
              aria-label={`要件${index + 1}の説明`}
            />
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={!canAdd}>
        <Plus className="h-4 w-4" />
        要件を追加
        {!canAdd && `（上限${GRADING_RUBRIC_MAX_REQUIREMENTS}件）`}
      </Button>
    </div>
  );
}
