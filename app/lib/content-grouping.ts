import type { ContentType, LearningContentWithWeek } from "@/app/types";

const UNCLASSIFIED_LABEL = "未分類";

/**
 * コンテンツ管理テーブル（クライアントコンポーネント）が表示に必要とする最小限のフィールド。
 * `LearningContentWithWeek` の週/フェーズ/テーマの入れ子や本文系フィールドをそのまま
 * クライアントに渡すとRSCペイロードが不必要に肥大化するため、表示用の型に絞って渡す。
 */
export interface ContentTableRow {
  id: number;
  title: string;
  display_order: number | null;
  content_type: ContentType;
  is_published: boolean;
  is_open_to_trial: boolean;
}

export interface ContentTableGroup {
  key: string;
  label: string;
  contents: ContentTableRow[];
}

/**
 * コンテンツ管理一覧の週単位グループ。
 * label は「テーマ名 › フェーズ名 › 週名」、週未設定コンテンツは「未分類」になる。
 */
export interface ContentGroup {
  key: string;
  label: string;
  contents: LearningContentWithWeek[];
}

/**
 * 階層順ソートにおける display_order の欠落値（未設定の親階層に加え、
 * display_order 列自体がDB上 NULL のケースも含む）を「その階層内で最後」として扱う。
 * アプリ側の型は display_order を number と定義しているが、DBのカラム自体は
 * NULL 許容（NOT NULL制約なし）のため、実行時には null が来ても崩れないようにする。
 */
function orderOrLast(order: number | null | undefined): number {
  return order ?? Number.POSITIVE_INFINITY;
}

/**
 * 欠落値同士（ともに Number.POSITIVE_INFINITY）を比較すると `Infinity - Infinity` は
 * NaN になり、Array.prototype.sort の比較関数として不正な値を返してしまう。
 * 同値は 0 を返すことで NaN を避ける。
 */
function compareOrder(orderA: number, orderB: number): number {
  return orderA === orderB ? 0 : orderA - orderB;
}

/**
 * テーマ→フェーズ→週→コンテンツの各 display_order 順にコンテンツを並び替える。
 * PostgREST はネストしたテーブルのカラムでトップレベルの並び替えができないため、
 * クライアント側（この純粋関数）で階層順ソートを行う。
 * 週が未設定のコンテンツ・display_order が欠落している階層は、末尾にまとめる。
 */
export function sortContentsByHierarchy(
  contents: LearningContentWithWeek[]
): LearningContentWithWeek[] {
  return [...contents].sort((a, b) => {
    const themeCompare = compareOrder(
      orderOrLast(a.week?.phase?.theme?.display_order),
      orderOrLast(b.week?.phase?.theme?.display_order)
    );
    if (themeCompare !== 0) return themeCompare;

    const phaseCompare = compareOrder(
      orderOrLast(a.week?.phase?.display_order),
      orderOrLast(b.week?.phase?.display_order)
    );
    if (phaseCompare !== 0) return phaseCompare;

    const weekCompare = compareOrder(
      orderOrLast(a.week?.display_order),
      orderOrLast(b.week?.display_order)
    );
    if (weekCompare !== 0) return weekCompare;

    const contentCompare = compareOrder(orderOrLast(a.display_order), orderOrLast(b.display_order));
    if (contentCompare !== 0) return contentCompare;

    // 全階層のdisplay_orderが同値（欠落含む）の場合でも比較関数は常に数値を
    // 返す必要があるため、idで確定的にタイブレークする
    return a.id - b.id;
  });
}

function buildGroupLabel(content: LearningContentWithWeek): string {
  if (!content.week) {
    return UNCLASSIFIED_LABEL;
  }

  const themeName = content.week.phase?.theme?.name;
  const phaseName = content.week.phase?.name;
  const weekName = content.week.name;

  return [themeName, phaseName, weekName].filter(Boolean).join(" › ");
}

/**
 * コンテンツを週単位（週未設定は「未分類」）にグルーピングする。
 * 事前に sortContentsByHierarchy で並び替えておくことで、グループの出現順が
 * テーマ→フェーズ→週の階層順・末尾が「未分類」になる。
 */
export function groupContentsByWeek(contents: LearningContentWithWeek[]): ContentGroup[] {
  const groups: ContentGroup[] = [];
  const groupByKey = new Map<string, ContentGroup>();

  for (const content of contents) {
    const key = content.week ? String(content.week.id) : "unclassified";

    let group = groupByKey.get(key);
    if (!group) {
      group = { key, label: buildGroupLabel(content), contents: [] };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.contents.push(content);
  }

  return groups;
}

/**
 * `groupContentsByWeek` の結果から、コンテンツ管理テーブルの表示に必要な最小限の
 * フィールドのみを抽出する。Server Component から `"use client"` コンポーネントへ
 * props として渡す直前に呼び出すことで、本文系フィールドや週/フェーズ/テーマの
 * 入れ子構造がクライアントバンドルへ送られるのを防ぐ。
 */
export function toContentTableGroups(groups: ContentGroup[]): ContentTableGroup[] {
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    contents: group.contents.map((content) => ({
      id: content.id,
      title: content.title,
      display_order: content.display_order,
      content_type: content.content_type,
      is_published: content.is_published,
      is_open_to_trial: content.is_open_to_trial,
    })),
  }));
}
