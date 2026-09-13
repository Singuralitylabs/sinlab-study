import { CONTENT_TYPES } from "@/app/constants/content";
import type { ContentType, ManageContentListItem, ManageWeekListItem } from "@/app/types";

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
 *
 * 管理画面一覧は `deriveWeekSelectOptions`（週一覧）を使う。本関数はテストと、
 * コンテンツ join 結果から選択肢を作りたい呼び出し向けに残す。
 */
export function deriveFilterOptions(contents: ManageContentListItem[]): ContentFilterOptions {
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

/**
 * 週一覧（join結果）からテーマ→フェーズ→週の連動セレクトの選択肢を導出する。追加フェッチは行わない。
 * 呼び出し前に sortWeeksByHierarchy を通しておくことで、選択肢もテーマ→フェーズ→週の
 * 階層順になる。`learning_weeks.phase_id` は NOT NULL のため、週は常に選択肢に含める
 * （`deriveFilterOptions` と異なり「週未設定」の除外は発生しない）。
 */
export function deriveWeekSelectOptions(weeks: ManageWeekListItem[]): ContentFilterOptions {
  const themes = new Map<number, ThemeFilterOption>();
  const phases = new Map<number, PhaseFilterOption>();

  for (const week of weeks) {
    const phase = week.phase;
    const theme = phase?.theme;

    if (theme && !themes.has(theme.id)) {
      themes.set(theme.id, { id: theme.id, name: theme.name });
    }
    if (phase && !phases.has(phase.id)) {
      phases.set(phase.id, { id: phase.id, name: phase.name, themeId: phase.theme_id });
    }
  }

  return {
    themes: [...themes.values()],
    phases: [...phases.values()],
    weeks: weeks.map((week) => ({ id: week.id, name: week.name, phaseId: week.phase_id })),
  };
}

export interface ContentFilterParams {
  q?: string;
}

/**
 * タイトル検索でコンテンツを絞り込む。
 * テーマ / フェーズ / 週 / 種別は `fetchAllContents` 側の SQL フィルタに寄せた（#196）。
 */
export function filterContents(
  contents: ManageContentListItem[],
  params: ContentFilterParams
): ManageContentListItem[] {
  const q = params.q?.trim().toLowerCase();
  if (!q) {
    return contents;
  }

  return contents.filter((content) => content.title.toLowerCase().includes(q));
}
