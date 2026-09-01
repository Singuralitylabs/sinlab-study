import type { LearningContentWithWeek } from "@/app/types";

const UNCLASSIFIED_LABEL = "未分類";

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
 * テーマ→フェーズ→週→コンテンツの各 display_order 順にコンテンツを並び替える。
 * PostgREST はネストしたテーブルのカラムでトップレベルの並び替えができないため、
 * クライアント側（この純粋関数）で階層順ソートを行う。
 * 週が未設定のコンテンツは、階層が確定している他のコンテンツより後ろにまとめる。
 */
export function sortContentsByHierarchy(
  contents: LearningContentWithWeek[]
): LearningContentWithWeek[] {
  return [...contents].sort((a, b) => {
    const themeOrderA = a.week?.phase?.theme?.display_order;
    const themeOrderB = b.week?.phase?.theme?.display_order;

    if (themeOrderA === undefined && themeOrderB === undefined) {
      return a.display_order - b.display_order;
    }
    if (themeOrderA === undefined) return 1;
    if (themeOrderB === undefined) return -1;
    if (themeOrderA !== themeOrderB) return themeOrderA - themeOrderB;

    const phaseOrderA = a.week?.phase?.display_order ?? 0;
    const phaseOrderB = b.week?.phase?.display_order ?? 0;
    if (phaseOrderA !== phaseOrderB) return phaseOrderA - phaseOrderB;

    const weekOrderA = a.week?.display_order ?? 0;
    const weekOrderB = b.week?.display_order ?? 0;
    if (weekOrderA !== weekOrderB) return weekOrderA - weekOrderB;

    return a.display_order - b.display_order;
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
