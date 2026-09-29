"use client";

import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { Label } from "@/components/ui/label";

const SELECT_CLASS_NAME =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

export interface SiblingOrderItem {
  id: number;
  label: string;
  isPublished: boolean;
}

/**
 * One candidate before the parent is known: filter by parentId, then pass as SiblingOrderItem[] to
 * SiblingOrderField (themes have no parent, so candidates are the targets themselves and this type
 * isn't used).
 */
export interface SiblingCandidate extends SiblingOrderItem {
  parentId: number;
}

/**
 * Default insert_after_id: the tail (after the last sibling); null (head) only when there are no
 * siblings. Used on create and right after an edit changes the parent.
 */
export function getDefaultInsertAfterId(siblings: SiblingOrderItem[]): number | null {
  return siblings.length > 0 ? siblings[siblings.length - 1].id : null;
}

/**
 * Default (= current position) when an edit doesn't change the parent. Pass a sorted list that
 * includes the target itself. Returns null when it is first or missing from the list (an
 * unclassified/deleted week leaves the sibling list empty) (#189).
 */
export function getCurrentPositionInsertAfterId(
  selfId: number,
  siblingsIncludingSelf: SiblingOrderItem[]
): number | null {
  const index = siblingsIncludingSelf.findIndex((sibling) => sibling.id === selfId);
  return index <= 0 ? null : siblingsIncludingSelf[index - 1].id;
}

interface SiblingOrderFieldProps {
  /**
   * Siblings of the displayed parent, already filtered and sorted (excluding itself in edit mode);
   * null while no parent is selected.
   */
  siblings: SiblingOrderItem[] | null;
  insertAfterId: number | null;
  onChange: (insertAfterId: number | null) => void;
  placeholderLabel?: string;
}

/**
 * Shared "insert position" field for the create/edit forms (#188, #189): shows siblings (including
 * unpublished; excluding deleted and, in edit mode, itself) as a read-only list with a placeholder
 * row at the chosen position. Sort order is decided by the caller (each new/edit page.tsx, per
 * compareGroupLevel), so this component doesn't sort.
 */
export function SiblingOrderField({
  siblings,
  insertAfterId,
  onChange,
  placeholderLabel = "ここに追加",
}: SiblingOrderFieldProps) {
  if (siblings === null) {
    return (
      <div className="space-y-2">
        <Label>挿入位置</Label>
        <p className="text-sm text-muted-foreground">親を選択すると一覧が表示されます</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="insertAfterId">挿入位置</Label>
      <select
        id="insertAfterId"
        value={insertAfterId === null ? "" : insertAfterId}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={SELECT_CLASS_NAME}
      >
        <option value="">先頭</option>
        {siblings.map((sibling) => (
          <option key={sibling.id} value={sibling.id}>
            {sibling.label}の後
          </option>
        ))}
      </select>

      {siblings.length === 0 && (
        <p className="text-sm text-muted-foreground">既存の要素はまだありません</p>
      )}
      <ul className="divide-y divide-border rounded-md border text-sm">
        {insertAfterId === null && (
          <li className="bg-primary/5 px-3 py-2 text-primary">{placeholderLabel}</li>
        )}
        {siblings.map((sibling) => (
          <li key={sibling.id}>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate">{sibling.label}</span>
              <UnpublishedBadge isPublished={sibling.isPublished} />
            </div>
            {insertAfterId === sibling.id && (
              <div className="bg-primary/5 px-3 py-2 text-primary">{placeholderLabel}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
