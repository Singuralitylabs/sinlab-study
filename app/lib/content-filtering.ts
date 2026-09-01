import type { ContentType, LearningContentWithWeek } from "@/app/types";

const CONTENT_TYPES: readonly ContentType[] = ["video", "text", "exercise", "slide"];

export function isContentType(value: string | undefined): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}

export interface ThemeFilterOption {
  id: number;
  name: string;
}

export interface PhaseFilterOption {
  id: number;
  name: string;
  themeId: number;
}

export interface WeekFilterOption {
  id: number;
  name: string;
  phaseId: number;
}

export interface ContentFilterOptions {
  themes: ThemeFilterOption[];
  phases: PhaseFilterOption[];
  weeks: WeekFilterOption[];
}

/**
 * コンテンツ一覧（join結果）からフィルタセレクトの選択肢を導出する。追加フェッチは行わない。
 * 呼び出し前に sortContentsByHierarchy を通しておくことで、選択肢もテーマ→フェーズ→週の
 * 階層順になる。
 */
export function deriveFilterOptions(contents: LearningContentWithWeek[]): ContentFilterOptions {
  const themes = new Map<number, ThemeFilterOption>();
  const phases = new Map<number, PhaseFilterOption>();
  const weeks = new Map<number, WeekFilterOption>();

  for (const content of contents) {
    const week = content.week;
    if (!week) continue;

    const phase = week.phase;
    const theme = phase?.theme;

    if (theme && !themes.has(theme.id)) {
      themes.set(theme.id, { id: theme.id, name: theme.name });
    }
    if (phase && !phases.has(phase.id)) {
      phases.set(phase.id, { id: phase.id, name: phase.name, themeId: phase.theme_id });
    }
    if (!weeks.has(week.id)) {
      weeks.set(week.id, { id: week.id, name: week.name, phaseId: week.phase_id });
    }
  }

  return {
    themes: [...themes.values()],
    phases: [...phases.values()],
    weeks: [...weeks.values()],
  };
}

export interface ContentFilterParams {
  themeId?: string;
  phaseId?: string;
  weekId?: string;
  type?: string;
  q?: string;
}

/**
 * テーマ / フェーズ / 週 / 種別 / タイトル検索でコンテンツを絞り込む。
 * テーマ・フェーズは content.week の join（phase.theme_id / week.phase_id）で判定するため、
 * 週が未設定（＝未分類）のコンテンツはいずれかの階層フィルタが指定されている場合は除外される。
 */
export function filterContents(
  contents: LearningContentWithWeek[],
  params: ContentFilterParams
): LearningContentWithWeek[] {
  const type = isContentType(params.type) ? params.type : undefined;
  const q = params.q?.trim().toLowerCase();

  return contents.filter((content) => {
    if (params.themeId && String(content.week?.phase?.theme_id) !== params.themeId) {
      return false;
    }
    if (params.phaseId && String(content.week?.phase_id) !== params.phaseId) {
      return false;
    }
    if (params.weekId && String(content.week_id) !== params.weekId) {
      return false;
    }
    if (type && content.content_type !== type) {
      return false;
    }
    if (q && !content.title.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}
