import { compareGroupLevel } from "@/app/lib/content-grouping";

/** 前後ナビの境界種別。URLパラメータではなく隣接要素の所属比較で決める */
export type NavigationBoundary = "same-week" | "week" | "phase";

/** テーマ内通し順の構築に使う週（フェーズ埋め込み付き） */
export interface NavigationWeek {
  id: number;
  name: string;
  display_order: number | null;
  phase: {
    id: number;
    name: string;
    display_order: number | null;
  } | null;
}

/** 通し順の構築に使うコンテンツの最小フィールド */
export interface NavigationContentInput {
  id: number;
  title: string;
  week_id: number;
  display_order: number | null;
}

/** テーマ内通し列の1件 */
export interface NavigationContent {
  id: number;
  title: string;
  weekId: number;
  weekName: string;
  phaseId: number;
  phaseName: string;
}

/** 前後ナビの遷移先（所属階層と境界種別付き） */
export interface AdjacentContent extends NavigationContent {
  boundary: NavigationBoundary;
}

/**
 * 週をフェーズ→週の階層順に並べ、各週のコンテンツを `display_order` 順に
 * つなぎ合わせてテーマ内の通し列を作る。
 *
 * 並び替えは `compareGroupLevel()` に委譲する（display_order 欠落は末尾、
 * 同値は id でタイブレーク）。空の週・空のフェーズは1件も寄与しない。
 * `phase` が null の週、および週リストに存在しない `week_id` のコンテンツは除外する。
 */
export function buildThemeContentOrder(
  weeks: NavigationWeek[],
  contents: NavigationContentInput[]
): NavigationContent[] {
  const weeksWithPhase = weeks.filter(
    (week): week is NavigationWeek & { phase: NonNullable<NavigationWeek["phase"]> } =>
      week.phase != null
  );

  const sortedWeeks = [...weeksWithPhase].sort((a, b) => {
    const phaseCompare = compareGroupLevel(
      a.phase.display_order,
      b.phase.display_order,
      a.phase.id,
      b.phase.id
    );
    if (phaseCompare !== 0) return phaseCompare;
    return compareGroupLevel(a.display_order, b.display_order, a.id, b.id);
  });

  const weekIds = new Set(sortedWeeks.map((week) => week.id));
  const contentsByWeekId = new Map<number, NavigationContentInput[]>();
  for (const content of contents) {
    if (!weekIds.has(content.week_id)) continue;
    const list = contentsByWeekId.get(content.week_id) ?? [];
    list.push(content);
    contentsByWeekId.set(content.week_id, list);
  }

  return sortedWeeks.flatMap((week) => {
    const weekContents = [...(contentsByWeekId.get(week.id) ?? [])].sort((a, b) =>
      compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
    );
    return weekContents.map((content) => ({
      id: content.id,
      title: content.title,
      weekId: week.id,
      weekName: week.name,
      phaseId: week.phase.id,
      phaseName: week.phase.name,
    }));
  });
}

function resolveBoundary(
  current: NavigationContent,
  adjacent: NavigationContent
): NavigationBoundary {
  if (current.weekId === adjacent.weekId) return "same-week";
  if (current.phaseId === adjacent.phaseId) return "week";
  return "phase";
}

function toAdjacent(
  current: NavigationContent,
  adjacent: NavigationContent | undefined
): AdjacentContent | null {
  if (!adjacent) return null;
  return { ...adjacent, boundary: resolveBoundary(current, adjacent) };
}

/**
 * 通し列上の前後コンテンツを返す。境界種別は隣接要素との phaseId / weekId
 * の比較だけで決め、URLパラメータには依存しない。
 *
 * `currentContentId` が列に無い場合、および通し列が空の場合は
 * `{ prev: null, next: null }`。
 */
export function resolveAdjacentContents(
  orderedContents: NavigationContent[],
  currentContentId: number
): { prev: AdjacentContent | null; next: AdjacentContent | null } {
  const index = orderedContents.findIndex((content) => content.id === currentContentId);
  if (index < 0) {
    return { prev: null, next: null };
  }

  const current = orderedContents[index];
  return {
    prev: toAdjacent(current, orderedContents[index - 1]),
    next: toAdjacent(current, orderedContents[index + 1]),
  };
}

/** 末尾ボタンの行き先。通し列上のテーマ末尾は theme、ナビ縮退時は phase */
export type NavigationEndFallback = "theme" | "phase";

/**
 * コンテンツ詳細の前後ナビを解決する。
 *
 * 現在のコンテンツがテーマ通し列にあるときはテーマ内遷移（末尾は「テーマに戻る」）。
 * 通し列が空、または現在のコンテンツが列に無い縮退時（未公開フェーズ配下の公開週など）は
 * 現在の週のサマリーだけで前後を算出し、末尾は従来どおり「フェーズに戻る」。
 */
export function resolveContentNavigation(
  orderedContents: NavigationContent[],
  currentContentId: number,
  weekLocalContents: NavigationContent[]
): {
  prev: AdjacentContent | null;
  next: AdjacentContent | null;
  endFallback: NavigationEndFallback;
} {
  if (orderedContents.some((content) => content.id === currentContentId)) {
    return {
      ...resolveAdjacentContents(orderedContents, currentContentId),
      endFallback: "theme",
    };
  }

  return {
    ...resolveAdjacentContents(weekLocalContents, currentContentId),
    endFallback: "phase",
  };
}
