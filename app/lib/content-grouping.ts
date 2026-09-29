import type {
  ContentType,
  ManageContentListItem,
  ManagePhaseListItem,
  ManageWeekListItem,
} from "@/app/types";

const UNCLASSIFIED_LABEL = "未分類";
const UNCLASSIFIED_KEY = "unclassified";

/**
 * Trimmed shape for the client table: passing the nested week/phase/theme and body fields would
 * bloat the RSC payload.
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

export interface ContentGroup {
  key: string;
  label: string;
  contents: ManageContentListItem[];
}

export interface WeekGroup {
  key: string;
  label: string;
  weeks: ManageWeekListItem[];
}

export interface PhaseGroup {
  key: string;
  label: string;
  phases: ManagePhaseListItem[];
}

/**
 * display_order is typed number but the DB column is nullable; a missing value sorts last within
 * its level.
 */
function orderOrLast(order: number | null | undefined): number {
  return order ?? Number.POSITIVE_INFINITY;
}

/** Infinity - Infinity is NaN, an invalid sort comparator result; return 0 for equal values. */
function compareOrder(orderA: number, orderB: number): number {
  return orderA === orderB ? 0 : orderA - orderB;
}

/**
 * Ties on display_order fall back to the level's own id before descending. The create form's
 * default
 * display_order is 0, so equal values are common; without the tiebreak, children of different
 * parents
 * would interleave.
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
 * PostgREST cannot order top-level rows by nested-table columns, so sort client-side. Missing
 * display_order sorts last.
 */
export function sortContentsByHierarchy(
  contents: ManageContentListItem[]
): ManageContentListItem[] {
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

    // The comparator must always return a number, so break remaining ties by id.
    return a.id - b.id;
  });
}

/**
 * Client-side sort (PostgREST cannot order by nested columns); same rules as
 * sortContentsByHierarchy.
 */
export function sortWeeksByHierarchy(weeks: ManageWeekListItem[]): ManageWeekListItem[] {
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

export function sortPhasesByHierarchy(phases: ManagePhaseListItem[]): ManagePhaseListItem[] {
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

  return Array.from(groupByKey.values());
}

/**
 * Blank-only names can reach the DB (RequiredStringSchema intentionally does not trim); treat them
 * as missing.
 */
function joinHierarchyLabel(...names: Array<string | undefined>): string {
  return (
    names
      .map((name) => name?.trim())
      .filter(Boolean)
      .join(" › ") || UNCLASSIFIED_LABEL
  );
}

export function groupContentsByWeek(contents: ManageContentListItem[]): ContentGroup[] {
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

export function groupWeeksByPhase(weeks: ManageWeekListItem[]): WeekGroup[] {
  return groupByKeyLabel(
    weeks,
    (week) => (week.phase ? String(week.phase.id) : UNCLASSIFIED_KEY),
    (week) => joinHierarchyLabel(week.phase?.theme?.name, week.phase?.name)
  ).map((group) => ({ key: group.key, label: group.label, weeks: group.items }));
}

export function groupPhasesByTheme(phases: ManagePhaseListItem[]): PhaseGroup[] {
  return groupByKeyLabel(
    phases,
    (phase) => (phase.theme ? String(phase.theme.id) : UNCLASSIFIED_KEY),
    (phase) => joinHierarchyLabel(phase.theme?.name)
  ).map((group) => ({ key: group.key, label: group.label, phases: group.items }));
}

/**
 * Strip to the fields the table needs so body fields and the nested hierarchy don't reach the
 * client bundle.
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

export interface SiblingOrderRow {
  id: number;
  display_order: number | null;
}

/**
 * Thrown when insert_after_id is not a live sibling under the same parent; callers map it to 400.
 * message is shown verbatim in the create form (the sibling list went stale after the form loaded),
 * so it
 * is user-facing and carries no internal ids. insertAfterId is kept for server logs.
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
 * Computes the new display_order and the sibling rows to renumber. Always renumbers from 1, which
 * also
 * heals pre-existing duplicates (the create form's default 0). Siblings need not be pre-sorted.
 * @throws InvalidInsertAfterIdError when insertAfterId is not among siblings; callers must pass
 * siblings
 *   filtered by the same parent and is_deleted=false.
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

/** Closes gaps left in the source parent after an edit moves a row to another parent (#189). */
export function resolveSiblingRenumber(siblings: SiblingOrderRow[]): SiblingOrderRow[] {
  const sorted = [...siblings].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  return sorted
    .map((sibling, index) => ({ id: sibling.id, display_order: index + 1 }))
    .filter((row, index) => row.display_order !== sorted[index].display_order);
}

/**
 * Default insert position (tail of the destination) when an edit changes parent without
 * insertAfterId (#189).
 */
export function getSiblingTailId(siblings: SiblingOrderRow[]): number | null {
  if (siblings.length === 0) return null;
  const sorted = [...siblings].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );
  return sorted[sorted.length - 1].id;
}
