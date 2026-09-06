"use client";

import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { Label } from "@/components/ui/label";

const SELECT_CLASS_NAME =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

/** 挿入位置ピッカーが表示する兄弟1件（表示対象の親で絞り込み済み・並び順ソート済み） */
export interface SiblingOrderItem {
  id: number;
  label: string;
  isPublished: boolean;
}

/**
 * 親が未確定な状態で渡す全候補1件。`parentId` で絞り込んでから `SiblingOrderItem[]` として
 * `SiblingOrderField` に渡す（テーマは親を持たないため候補=対象そのもので、この型は使わない）。
 */
export interface SiblingCandidate extends SiblingOrderItem {
  parentId: number;
}

/**
 * 挿入位置（insert_after_id）の既定値を求める。末尾（最後の兄弟の直後）が既定で、
 * 兄弟が存在しない場合のみ先頭（null）になる。
 */
export function getDefaultInsertAfterId(siblings: SiblingOrderItem[]): number | null {
  return siblings.length > 0 ? siblings[siblings.length - 1].id : null;
}

interface SiblingOrderFieldProps {
  /** 表示対象の親で絞り込み済み・並び順ソート済みの兄弟一覧。親未選択時は null */
  siblings: SiblingOrderItem[] | null;
  /** 挿入位置。null = 先頭、数値 = その兄弟要素IDの直後 */
  insertAfterId: number | null;
  onChange: (insertAfterId: number | null) => void;
}

/**
 * 新規作成フォーム共通の「挿入位置」フィールド（issue #188）。
 * 兄弟要素（非公開を含み、論理削除済みは除く）を並び順で読み取り専用リスト表示し、
 * 挿入位置セレクトで選んだ位置に「ここに追加」のプレースホルダー行を表示する。
 * 兄弟一覧の並び順は呼び出し側（各 new/page.tsx。compareGroupLevel 準拠）が決めるため、
 * このコンポーネント自身では並び替えを行わない。
 */
export function SiblingOrderField({ siblings, insertAfterId, onChange }: SiblingOrderFieldProps) {
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

      {siblings.length === 0 ? (
        <p className="text-sm text-muted-foreground">既存の要素はまだありません</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border text-sm">
          {insertAfterId === null && (
            <li className="bg-primary/5 px-3 py-2 text-primary">ここに追加</li>
          )}
          {siblings.map((sibling) => (
            <li key={sibling.id}>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate">{sibling.label}</span>
                <UnpublishedBadge isPublished={sibling.isPublished} />
              </div>
              {insertAfterId === sibling.id && (
                <div className="bg-primary/5 px-3 py-2 text-primary">ここに追加</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
