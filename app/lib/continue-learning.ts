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
};

export type ContinueLearningTarget = ContinueLearningContent & {
  href: string;
  /** ISO timestamp of the most recent view used as the card's 「前回」; null when no views. */
  lastViewedAt: string | null;
};

function toTarget(
  content: ContinueLearningContent,
  lastViewedAt: string | null
): ContinueLearningTarget {
  return {
    ...content,
    href: `/learn/${content.themeId}/${content.phaseId}/${content.id}`,
    lastViewedAt,
  };
}

/**
 * #370 fallback: theme of the most recent completion → first incomplete in that theme; no
 * completions → first content of the first theme; last-learned theme fully done → next theme by
 * display order; everything complete → null.
 */
function resolveByCompletions(
  orderedContents: readonly ContinueLearningContent[],
  completedContentIds: ReadonlySet<number>,
  completedAtByContentId: ReadonlyMap<number, number>
): ContinueLearningContent | null {
  if (orderedContents.length === 0) return null;

  const themes = new Map<
    number,
    {
      contents: ContinueLearningContent[];
      completedContents: number;
      lastCompletedAt: number | null;
      firstIncomplete: ContinueLearningContent | null;
    }
  >();

  for (const content of orderedContents) {
    const theme = themes.get(content.themeId) ?? {
      contents: [],
      completedContents: 0,
      lastCompletedAt: null,
      firstIncomplete: null,
    };
    theme.contents.push(content);
    if (completedContentIds.has(content.id)) {
      theme.completedContents += 1;
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
      const lastIndex = themeList.indexOf(lastTheme);
      chosen =
        themeList.slice(lastIndex + 1).find((t) => t.firstIncomplete != null) ??
        incompleteThemes[0];
    }
  }

  return chosen.firstIncomplete;
}

/**
 * Next content after a completed anchor: prefer the next incomplete after the anchor in the same
 * theme; if the theme still has earlier incompletes, take the first of those (theme not finished);
 * else the next theme's first incomplete (display order).
 */
function resolveAfterCompletedAnchor(
  orderedContents: readonly ContinueLearningContent[],
  completedContentIds: ReadonlySet<number>,
  anchor: ContinueLearningContent
): ContinueLearningContent | null {
  const sameTheme = orderedContents.filter((c) => c.themeId === anchor.themeId);
  const anchorIndex = sameTheme.findIndex((c) => c.id === anchor.id);
  const afterInTheme = sameTheme.slice(anchorIndex + 1).find((c) => !completedContentIds.has(c.id));
  if (afterInTheme) return afterInTheme;

  const earlierInTheme = sameTheme.find((c) => !completedContentIds.has(c.id));
  if (earlierInTheme) return earlierInTheme;

  const themeOrder: number[] = [];
  for (const c of orderedContents) {
    if (!themeOrder.includes(c.themeId)) themeOrder.push(c.themeId);
  }
  const themeIndex = themeOrder.indexOf(anchor.themeId);
  for (const themeId of themeOrder.slice(themeIndex + 1)) {
    const first = orderedContents.find(
      (c) => c.themeId === themeId && !completedContentIds.has(c.id)
    );
    if (first) return first;
  }
  return null;
}

/**
 * Next content to open from home (#396):
 * - With any last_viewed_at: max timestamp wins. Incomplete → that content; complete → next
 *   incomplete in the same theme, else the next theme's first incomplete.
 * - No views → #370 completion-based rules.
 * - Everything complete → null.
 *
 * Intentionally diverges from weekly-digest resolveNextContent() (email-digest.ts).
 */
export function resolveContinueLearning(
  orderedContents: readonly ContinueLearningContent[],
  completedContentIds: ReadonlySet<number>,
  completedAtByContentId: ReadonlyMap<number, number>,
  lastViewedAtByContentId: ReadonlyMap<number, number> = new Map()
): ContinueLearningTarget | null {
  if (orderedContents.length === 0) return null;

  let latestViewedAt: number | null = null;
  let latestViewedContent: ContinueLearningContent | null = null;
  for (const content of orderedContents) {
    const viewedAt = lastViewedAtByContentId.get(content.id);
    if (viewedAt == null) continue;
    if (latestViewedAt == null || viewedAt > latestViewedAt) {
      latestViewedAt = viewedAt;
      latestViewedContent = content;
    }
  }

  const lastViewedAtIso = latestViewedAt != null ? new Date(latestViewedAt).toISOString() : null;

  if (latestViewedContent && latestViewedAt != null) {
    if (!completedContentIds.has(latestViewedContent.id)) {
      return toTarget(latestViewedContent, lastViewedAtIso);
    }
    const next =
      resolveAfterCompletedAnchor(orderedContents, completedContentIds, latestViewedContent) ??
      // Earlier incompletes (other themes / earlier in the same theme) must not hide the card.
      orderedContents.find((c) => !completedContentIds.has(c.id)) ??
      null;
    return next ? toTarget(next, lastViewedAtIso) : null;
  }

  const byCompletion = resolveByCompletions(
    orderedContents,
    completedContentIds,
    completedAtByContentId
  );
  return byCompletion ? toTarget(byCompletion, null) : null;
}
