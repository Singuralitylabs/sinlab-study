export interface SavedChatNoteRow {
  id: number;
  content_id: number;
  question: string;
  answer: string;
  created_at: string;
}

export interface SavedChatNoteContentMeta {
  title: string;
  themeId: number;
  themeName: string;
  href: string;
}

export interface SavedChatNoteView {
  id: number;
  contentId: number;
  contentTitle: string;
  themeId: number;
  themeName: string;
  href: string;
  question: string;
  answer: string;
  createdAt: string;
}

/**
 * Saved answers in learning order (theme → content), oldest first within a content. A note on a
 * content the learner can no longer see (unpublished, or out of the trial set) is hidden, not
 * deleted: it comes back if the content does.
 */
export function buildSavedChatNoteViews(
  rows: readonly SavedChatNoteRow[],
  metas: ReadonlyMap<number, SavedChatNoteContentMeta>,
  order: ReadonlyMap<number, number>
): SavedChatNoteView[] {
  return rows
    .flatMap((row) => {
      const meta = metas.get(row.content_id);
      if (!meta) {
        return [];
      }
      return [
        {
          id: row.id,
          contentId: row.content_id,
          contentTitle: meta.title,
          themeId: meta.themeId,
          themeName: meta.themeName,
          href: meta.href,
          question: row.question,
          answer: row.answer,
          createdAt: row.created_at,
        },
      ];
    })
    .sort((a, b) => {
      const orderA = order.get(a.contentId) ?? Number.MAX_SAFE_INTEGER;
      const orderB = order.get(b.contentId) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id;
    });
}
