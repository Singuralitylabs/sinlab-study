/**
 * Pure selection for the home "続きから学習" card. Callers pass contents already limited to what
 * the learner may see (published / not deleted; trial-open for trial), in learning order within
 * each theme and theme display_order across themes — the same order as buildThemeContentOrder()
 * per theme and compareGroupLevel() for themes.
 */

import type { ContentType } from "@/app/types";

export type ContinueLearningContent = {
  id: number;
  title: string;
  contentType: ContentType;
  themeId: number;
  themeName: string;
  phaseId: number;
  weekId: number;
};

export type ContinueLearningTarget = ContinueLearningContent & {
  completedContents: number;
  totalContents: number;
  href: string;
};

/**
 * Next content to open from home. Rules (#370):
 * - Theme of the most recent completion → first incomplete in that theme's learning order
 * - No completions → first content of the first theme
 * - Last-learned theme fully done → first incomplete in the next theme (display order)
 * - Everything complete → null (caller hides the card)
 *
 * Intentionally diverges from weekly-digest resolveNextContent() (email-digest.ts): that picks
 * among started-and-unfinished themes by latest completion, else the first incomplete overall.
 * Home follows #370 (last theme → next by display order) and must not be merged blindly.
 */
export function resolveContinueLearning(
  orderedContents: readonly ContinueLearningContent[],
  completedContentIds: ReadonlySet<number>,
  completedAtByContentId: ReadonlyMap<number, number>
): ContinueLearningTarget | null {
  if (orderedContents.length === 0) return null;

  const themes = new Map<
    number,
    {
      themeName: string;
      contents: ContinueLearningContent[];
      completedContents: number;
      /** Latest real completed_at in this theme; null when every completion lacks a timestamp. */
      lastCompletedAt: number | null;
      firstIncomplete: ContinueLearningContent | null;
    }
  >();

  for (const content of orderedContents) {
    const theme = themes.get(content.themeId) ?? {
      themeName: content.themeName,
      contents: [],
      completedContents: 0,
      lastCompletedAt: null,
      firstIncomplete: null,
    };
    theme.contents.push(content);
    if (completedContentIds.has(content.id)) {
      theme.completedContents += 1;
      // Missing completed_at must not become epoch 0 — that wrongly beats older real times.
      const completedAt = completedAtByContentId.get(content.id);
      if (
        completedAt != null &&
        (theme.lastCompletedAt == null || completedAt > theme.lastCompletedAt)
      ) {
        theme.lastCompletedAt = completedAt;
      }
    } else if (!theme.firstIncomplete) {
      theme.firstIncomplete = content;
    }
    themes.set(content.themeId, theme);
  }

  const themeList = [...themes.values()];
  const incompleteThemes = themeList.filter((t) => t.firstIncomplete != null);
  if (incompleteThemes.length === 0) return null;

  let chosen = incompleteThemes[0];
  if (completedContentIds.size > 0) {
    // Prefer themes with a real completed_at; among those, max timestamp wins. Themes that only
    // have missing times stay behind timestamped ones and keep display order among themselves.
    let lastTheme: (typeof themeList)[number] | null = null;
    for (const theme of themeList) {
      if (theme.completedContents === 0) continue;
      if (lastTheme == null) {
        lastTheme = theme;
        continue;
      }
      if (theme.lastCompletedAt == null) continue;
      if (lastTheme.lastCompletedAt == null || theme.lastCompletedAt > lastTheme.lastCompletedAt) {
        lastTheme = theme;
      }
    }
    if (lastTheme?.firstIncomplete) {
      chosen = lastTheme;
    } else if (lastTheme) {
      // Last-learned theme is done: take the next theme (in display order) that still has work.
      const lastIndex = themeList.indexOf(lastTheme);
      chosen =
        themeList.slice(lastIndex + 1).find((t) => t.firstIncomplete != null) ??
        incompleteThemes[0];
    }
  }

  const next = chosen.firstIncomplete;
  if (!next) return null;

  return {
    ...next,
    completedContents: chosen.completedContents,
    totalContents: chosen.contents.length,
    href: `/learn/${next.themeId}/${next.phaseId}/${next.weekId}/${next.id}`,
  };
}
