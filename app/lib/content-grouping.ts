import type {
  ContentType,
  LearningContentWithWeek,
  LearningPhaseWithTheme,
  LearningWeekWithPhase,
} from "@/app/types";

const UNCLASSIFIED_LABEL = "未分類";
const UNCLASSIFIED_KEY = "unclassified";

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
 * 週管理一覧のフェーズ単位グループ。
 * label は「テーマ名 › フェーズ名」、フェーズ未設定の週は「未分類」になる。
 */
export interface WeekGroup {
  key: string;
  label: string;
  weeks: LearningWeekWithPhase[];
}

/**
 * フェーズ管理一覧のテーマ単位グループ。
 * label は「テーマ名」、テーマ未設定のフェーズは「未分類」になる。
 */
export interface PhaseGroup {
  key: string;
  label: string;
  phases: LearningPhaseWithTheme[];
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
 * 中間階層（テーマ・フェーズ）の並び替えに使う。display_order が同値の場合、その階層自身の
 * id でタイブレークしてから下位階層の比較に進む。新規作成フォームの display_order の
 * デフォルト値は0で、テーマ・フェーズ間で同値が揃うことが珍しくないため、ここでidタイブレーク
 * をしないと別の親を持つ子要素同士が display_order だけで混在してしまう。
 */
export function compareGroupLevel(
  orderA: number | null | undefined,
  orderB: number | null | undefined,
  idA: number | undefined,
  idB: number | undefined
): number {
  const orderCompare = compareOrder(orderOrLast(orderA), orderOrLast(orderB));
  if (orderCompare !== 0) return orderCompare;
  return compareOrder(orderOrLast(idA), orderOrLast(idB));
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
    const themeCompare = compareGroupLevel(
      a.week?.phase?.theme?.display_order,
      b.week?.phase?.theme?.display_order,
      a.week?.phase?.theme?.id,
      b.week?.phase?.theme?.id
    );
    if (themeCompare !== 0) return themeCompare;

    const phaseCompare = compareGroupLevel(
      a.week?.phase?.display_order,
      b.week?.phase?.display_order,
      a.week?.phase?.id,
      b.week?.phase?.id
    );
    if (phaseCompare !== 0) return phaseCompare;

    const weekCompare = compareGroupLevel(
      a.week?.display_order,
      b.week?.display_order,
      a.week?.id,
      b.week?.id
    );
    if (weekCompare !== 0) return weekCompare;

    const contentCompare = compareOrder(orderOrLast(a.display_order), orderOrLast(b.display_order));
    if (contentCompare !== 0) return contentCompare;

    // 全階層のdisplay_orderが同値（欠落含む）の場合でも比較関数は常に数値を
    // 返す必要があるため、idで確定的にタイブレークする
    return a.id - b.id;
  });
}

/**
 * テーマ→フェーズ→週の各 display_order 順に週を並び替える。
 * PostgREST はネストしたテーブルのカラムでトップレベルの並び替えができないため、
 * クライアント側（この純粋関数）で階層順ソートを行う。`sortContentsByHierarchy` と
 * 同じ規則（display_order 欠落は末尾、中間階層はidタイブレーク、最後は自身のidタイブレーク）
 * に揃える。
 */
export function sortWeeksByHierarchy(weeks: LearningWeekWithPhase[]): LearningWeekWithPhase[] {
  return [...weeks].sort((a, b) => {
    const themeCompare = compareGroupLevel(
      a.phase?.theme?.display_order,
      b.phase?.theme?.display_order,
      a.phase?.theme?.id,
      b.phase?.theme?.id
    );
    if (themeCompare !== 0) return themeCompare;

    const phaseCompare = compareGroupLevel(
      a.phase?.display_order,
      b.phase?.display_order,
      a.phase?.id,
      b.phase?.id
    );
    if (phaseCompare !== 0) return phaseCompare;

    const weekCompare = compareOrder(orderOrLast(a.display_order), orderOrLast(b.display_order));
    if (weekCompare !== 0) return weekCompare;

    return a.id - b.id;
  });
}

/**
 * テーマ→フェーズの各 display_order 順にフェーズを並び替える。
 * `sortWeeksByHierarchy` / `sortContentsByHierarchy` と同じ規則（display_order 欠落は
 * 末尾、中間階層はidタイブレーク、最後は自身のidタイブレーク）に揃える。
 */
export function sortPhasesByHierarchy(phases: LearningPhaseWithTheme[]): LearningPhaseWithTheme[] {
  return [...phases].sort((a, b) => {
    const themeCompare = compareGroupLevel(
      a.theme?.display_order,
      b.theme?.display_order,
      a.theme?.id,
      b.theme?.id
    );
    if (themeCompare !== 0) return themeCompare;

    const phaseCompare = compareOrder(orderOrLast(a.display_order), orderOrLast(b.display_order));
    if (phaseCompare !== 0) return phaseCompare;

    return a.id - b.id;
  });
}

/**
 * key/label の導出方法だけを差し替えて要素をグルーピングする内部ヘルパー。
 * `groupContentsByWeek` / `groupWeeksByPhase` / `groupPhasesByTheme` の共通部分。
 * 出現順は入力配列の順序をそのまま維持する（事前に階層順ソートしておく前提）。
 */
function groupByKeyLabel<T>(
  items: T[],
  keyOf: (item: T) => string,
  labelOf: (item: T) => string
): Array<{ key: string; label: string; items: T[] }> {
  const groupByKey = new Map<string, { key: string; label: string; items: T[] }>();

  for (const item of items) {
    const key = keyOf(item);

    let group = groupByKey.get(key);
    if (!group) {
      group = { key, label: labelOf(item), items: [] };
      groupByKey.set(key, group);
    }
    group.items.push(item);
  }

  // Map は挿入順を保持するため、出現順（事前ソート済みの階層順）がそのまま維持される
  return Array.from(groupByKey.values());
}

/**
 * 階層名（テーマ名・フェーズ名・週名など）を「 › 」区切りで結合してラベルを作る。
 * 祖先が未設定、または名前が空白のみで欠落扱いになる場合は「未分類」にする
 * （`RequiredStringSchema` は意図的にトリムしないため、空白のみの名前がDBに入りうる）。
 */
function joinHierarchyLabel(...names: Array<string | undefined>): string {
  return (
    names
      .map((name) => name?.trim())
      .filter(Boolean)
      .join(" › ") || UNCLASSIFIED_LABEL
  );
}

/**
 * コンテンツを週単位（週未設定は「未分類」）にグルーピングする。
 * 事前に sortContentsByHierarchy で並び替えておくことで、グループの出現順が
 * テーマ→フェーズ→週の階層順・末尾が「未分類」になる。
 */
export function groupContentsByWeek(contents: LearningContentWithWeek[]): ContentGroup[] {
  return groupByKeyLabel(
    contents,
    (content) => (content.week ? String(content.week.id) : UNCLASSIFIED_KEY),
    (content) =>
      joinHierarchyLabel(
        content.week?.phase?.theme?.name,
        content.week?.phase?.name,
        content.week?.name
      )
  ).map((group) => ({ key: group.key, label: group.label, contents: group.items }));
}

/**
 * 週をフェーズ単位（フェーズ未設定は「未分類」）にグルーピングする。
 * 事前に sortWeeksByHierarchy で並び替えておくことで、グループの出現順が
 * テーマ→フェーズの階層順・末尾が「未分類」になる。
 */
export function groupWeeksByPhase(weeks: LearningWeekWithPhase[]): WeekGroup[] {
  return groupByKeyLabel(
    weeks,
    (week) => (week.phase ? String(week.phase.id) : UNCLASSIFIED_KEY),
    (week) => joinHierarchyLabel(week.phase?.theme?.name, week.phase?.name)
  ).map((group) => ({ key: group.key, label: group.label, weeks: group.items }));
}

/**
 * フェーズをテーマ単位（テーマ未設定は「未分類」）にグルーピングする。
 * 事前に sortPhasesByHierarchy で並び替えておくことで、グループの出現順が
 * テーマの階層順・末尾が「未分類」になる。
 */
export function groupPhasesByTheme(phases: LearningPhaseWithTheme[]): PhaseGroup[] {
  return groupByKeyLabel(
    phases,
    (phase) => (phase.theme ? String(phase.theme.id) : UNCLASSIFIED_KEY),
    (phase) => joinHierarchyLabel(phase.theme?.name)
  ).map((group) => ({ key: group.key, label: group.label, phases: group.items }));
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

// ==================== 兄弟要素の挿入位置（新規作成フォーム用） ====================

/** 兄弟要素の再採番に使う最小限のフィールド */
export interface SiblingOrderRow {
  id: number;
  display_order: number | null;
}

/**
 * `insert_after_id` が同じ親配下の未削除要素として存在しない場合に投げるエラー
 * （別の親配下・論理削除済み・存在しないIDのいずれか）。呼び出し側（APIルート）で
 * catch し、400 として返すこと。
 *
 * `message` は API のエラーレスポンス（`{ error: string }`）経由でそのまま新規作成フォームに
 * 表示される（`route.ts` の catch → `data.error` → `setMessage()`）。原因はいずれも
 * 「フォーム表示後に兄弟一覧が古くなった」ケースのため、内部識別子は含めず、画面の
 * 再読み込みを促す利用者向けの文言にする。`insertAfterId` はサーバーログ用に
 * `insertAfterId` プロパティへ保持し、呼び出し側の `console.error` で使う。
 */
export class InvalidInsertAfterIdError extends Error {
  readonly insertAfterId: number;

  constructor(insertAfterId: number) {
    super(
      "選択した挿入位置は既に変更されています。画面を再読み込みしてから、もう一度お試しください。"
    );
    this.insertAfterId = insertAfterId;
  }
}

/**
 * 兄弟要素一覧と挿入位置（insert_after_id）から、新要素の display_order と、
 * 既存兄弟のうち display_order を更新すべき行を求める。兄弟一覧は事前ソート済みである
 * 必要はなく、この関数自身が compareGroupLevel（各 sortXxxByHierarchy と同じ比較関数）
 * で並び替える。常に1から連番に再採番するため、既存の重複値（新規作成フォームの
 * display_order 初期値0の連発など）もここで解消される。
 *
 * @throws InvalidInsertAfterIdError insertAfterId が兄弟一覧に存在しない場合。
 *   呼び出し側は兄弟一覧を同じ親・is_deleted=falseで絞り込んで渡すこと。
 */
export function resolveSiblingResequence(
  siblings: SiblingOrderRow[],
  insertAfterId: number | null
): { displayOrder: number; updates: SiblingOrderRow[] } {
  const sorted = [...siblings].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );

  if (insertAfterId !== null && !sorted.some((sibling) => sibling.id === insertAfterId)) {
    throw new InvalidInsertAfterIdError(insertAfterId);
  }

  const insertIndex =
    insertAfterId === null ? 0 : sorted.findIndex((sibling) => sibling.id === insertAfterId) + 1;

  const updates = sorted
    .map((sibling, index) => ({
      id: sibling.id,
      display_order: index < insertIndex ? index + 1 : index + 2,
    }))
    .filter((row, index) => row.display_order !== sorted[index].display_order);

  return { displayOrder: insertIndex + 1, updates };
}

/**
 * 兄弟一覧（挿入を伴わない）を現在の並び順のまま1からの連番に詰め直す。編集フォームで
 * 親を変更した際、移動元に残った兄弟の欠番を埋めるために使う（issue #189）。
 * ソート規則は `resolveSiblingResequence` と同じ `compareGroupLevel` を使う。
 */
export function resolveSiblingRenumber(siblings: SiblingOrderRow[]): SiblingOrderRow[] {
  const sorted = [...siblings].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  return sorted
    .map((sibling, index) => ({ id: sibling.id, display_order: index + 1 }))
    .filter((row, index) => row.display_order !== sorted[index].display_order);
}

/**
 * 兄弟一覧（並び順ソート済みである必要はない）のうち、現在の並び順で最後の要素のIDを返す。
 * 兄弟が存在しない場合は null（＝先頭）。編集フォームで親を変更し、かつ `insertAfterId` が
 * 省略された場合の既定値（移動先の末尾）を求めるために使う（issue #189）。
 */
export function getSiblingTailId(siblings: SiblingOrderRow[]): number | null {
  if (siblings.length === 0) return null;
  const sorted = [...siblings].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  return sorted[sorted.length - 1].id;
}
