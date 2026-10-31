import type { PostgrestError } from "@supabase/supabase-js";
import {
  applyPublishedNestedThemeFilters,
  type NestedThemeTree,
  orderContentsAcrossThemes,
} from "@/app/lib/published-theme-tree";
import {
  countUnovercomeReviewItems,
  type DerivedReviewItem,
  deriveReviewListWithRequirementNames,
  filterReviewItemsToVisibleContents,
  findOrphanRequirementNotes,
  type ReviewListSourceReview,
  sortReviewItemsByLearningOrder,
} from "@/app/lib/review-list";
import type { ScoreKind } from "@/app/types";
import { createServerSupabaseClient } from "./supabase-server";

export type ReviewNoteRow = {
  content_id: number;
  requirement_key: string | null;
  memo: string | null;
  understood_at: string | null;
};

export type ReviewListContentMeta = {
  contentId: number;
  title: string;
  themeId: number;
  themeName: string;
  phaseId: number;
  href: string;
};

export type ReviewListItemView = DerivedReviewItem & {
  contentTitle: string;
  themeId: number;
  themeName: string;
  href: string;
  memo: string | null;
  understoodAt: string | null;
};

export type FreeMemoView = {
  contentId: number;
  contentTitle: string;
  themeId: number;
  themeName: string;
  href: string;
  memo: string;
};

/** Requirement-keyed note whose item was replaced (estimated key rename) or dropped from the list. */
export type OrphanMemoView = {
  contentId: number;
  contentTitle: string;
  themeId: number;
  themeName: string;
  href: string;
  requirementKey: string;
  requirementName: string;
  memo: string;
  understoodAt: string | null;
};

/**
 * Completed AI reviews for the learner (session client + RLS). Used only to derive the review
 * list in memory — never copied into review_notes.
 */
export async function fetchReviewListSourceReviews(userId: number): Promise<{
  data: ReviewListSourceReview[];
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const pageSize = 1000;
  const reviews: ReviewListSourceReview[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("submissions")
      .select(
        "id, content_id, ai_review:ai_reviews!inner(id, status, score_kind, review_json, reviewed_at, created_at)"
      )
      .eq("user_id", userId)
      .eq("ai_review.status", "completed")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("復習リスト用レビュー取得エラー:", error.message);
      return { data: [], error };
    }
    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const aiReview = row.ai_review as unknown as {
        id: number;
        status: string;
        score_kind: string;
        review_json: unknown;
        reviewed_at: string | null;
        created_at: string;
      } | null;
      if (!aiReview) continue;
      reviews.push({
        id: aiReview.id,
        contentId: row.content_id,
        scoreKind: aiReview.score_kind as ScoreKind,
        reviewJson: aiReview.review_json,
        reviewedAt: aiReview.reviewed_at ?? aiReview.created_at,
      });
    }

    if (data.length < pageSize) {
      break;
    }
  }

  return { data: reviews, error: null };
}

export async function fetchReviewNotes(userId: number): Promise<{
  data: ReviewNoteRow[];
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const pageSize = 1000;
  const rows: ReviewNoteRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("review_notes")
      .select("content_id, requirement_key, memo, understood_at")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("復習メモ取得エラー:", error.message);
      return { data: [], error };
    }
    if (!data || data.length === 0) {
      break;
    }
    rows.push(...data);
    if (data.length < pageSize) {
      break;
    }
  }

  return { data: rows, error: null };
}

export async function fetchReviewNotesForContent(
  userId: number,
  contentId: number
): Promise<{ data: ReviewNoteRow[]; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("review_notes")
    .select("content_id, requirement_key, memo, understood_at")
    .eq("user_id", userId)
    .eq("content_id", contentId);

  if (error) {
    console.error("復習メモ取得エラー:", error.message);
    return { data: [], error };
  }
  return { data: data ?? [], error: null };
}

/**
 * Visible contents in learning order (same published filters as theme progress). Session client;
 * no service_role.
 */
export async function fetchReviewListContentOrder(): Promise<{
  metas: Map<number, ReviewListContentMeta>;
  order: Map<number, number>;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await applyPublishedNestedThemeFilters(
    supabase
      .from("learning_themes")
      .select(
        "id, name, display_order, phases:learning_phases(id, name, display_order, contents:learning_contents(id, title, display_order, phase_id))"
      )
  ).order("display_order");

  if (error) {
    console.error("復習リスト用コンテンツ順取得エラー:", error.message);
    return { metas: new Map(), order: new Map(), error };
  }

  const metas = new Map<number, ReviewListContentMeta>();
  const order = new Map<number, number>();
  let rank = 0;
  for (const { themeId, themeName, content } of orderContentsAcrossThemes(
    (data ?? []) as NestedThemeTree[]
  )) {
    order.set(content.id, rank);
    rank += 1;
    metas.set(content.id, {
      contentId: content.id,
      title: content.title,
      themeId,
      themeName,
      phaseId: content.phaseId,
      href: `/learn/${themeId}/${content.phaseId}/${content.id}`,
    });
  }

  return { metas, order, error: null };
}

export async function buildReviewListForUser(userId: number): Promise<{
  unovercome: ReviewListItemView[];
  overcome: ReviewListItemView[];
  orphanMemos: OrphanMemoView[];
  freeMemos: FreeMemoView[];
  unovercomeCount: number;
  error: PostgrestError | null;
}> {
  const [reviewsResult, notesResult, contentResult] = await Promise.all([
    fetchReviewListSourceReviews(userId),
    fetchReviewNotes(userId),
    fetchReviewListContentOrder(),
  ]);

  if (reviewsResult.error || notesResult.error || contentResult.error) {
    return {
      unovercome: [],
      overcome: [],
      orphanMemos: [],
      freeMemos: [],
      unovercomeCount: 0,
      error: reviewsResult.error ?? notesResult.error ?? contentResult.error,
    };
  }

  const { items: derived, requirementNames } = deriveReviewListWithRequirementNames(
    reviewsResult.data
  );
  const sorted = sortReviewItemsByLearningOrder(derived, contentResult.order);

  const noteByKey = new Map<string, ReviewNoteRow>();
  for (const note of notesResult.data) {
    noteByKey.set(`${note.content_id}:${note.requirement_key ?? ""}`, note);
  }

  const visibleIds = new Set(contentResult.metas.keys());
  const visibleSorted = filterReviewItemsToVisibleContents(sorted, visibleIds);

  const toView = (item: DerivedReviewItem): ReviewListItemView => {
    const meta = contentResult.metas.get(item.contentId) as ReviewListContentMeta;
    const note = noteByKey.get(`${item.contentId}:${item.requirementKey}`);
    return {
      ...item,
      contentTitle: meta.title,
      themeId: meta.themeId,
      themeName: meta.themeName,
      href: meta.href,
      memo: note?.memo ?? null,
      understoodAt: note?.understood_at ?? null,
    };
  };

  const views = visibleSorted.map(toView);
  const unovercome = views.filter((item) => !item.overcome);
  const overcome = views.filter((item) => item.overcome);

  const orphanMemos: OrphanMemoView[] = [];
  for (const note of findOrphanRequirementNotes(notesResult.data, views)) {
    const meta = contentResult.metas.get(note.content_id);
    if (!meta) continue;
    orphanMemos.push({
      contentId: note.content_id,
      contentTitle: meta.title,
      themeId: meta.themeId,
      themeName: meta.themeName,
      href: meta.href,
      requirementKey: note.requirement_key,
      requirementName:
        requirementNames.get(`${note.content_id}:${note.requirement_key}`) ?? note.requirement_key,
      memo: note.memo,
      understoodAt: note.understood_at,
    });
  }
  orphanMemos.sort((a, b) => {
    const orderA = contentResult.order.get(a.contentId) ?? Number.MAX_SAFE_INTEGER;
    const orderB = contentResult.order.get(b.contentId) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.requirementKey.localeCompare(b.requirementKey);
  });

  const freeMemos: FreeMemoView[] = [];
  for (const note of notesResult.data) {
    if (note.requirement_key !== null) continue;
    if (!note.memo || note.memo.trim() === "") continue;
    const meta = contentResult.metas.get(note.content_id);
    if (!meta) continue;
    freeMemos.push({
      contentId: note.content_id,
      contentTitle: meta.title,
      themeId: meta.themeId,
      themeName: meta.themeName,
      href: meta.href,
      memo: note.memo,
    });
  }
  freeMemos.sort((a, b) => {
    const orderA = contentResult.order.get(a.contentId) ?? Number.MAX_SAFE_INTEGER;
    const orderB = contentResult.order.get(b.contentId) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

  return {
    unovercome,
    overcome,
    orphanMemos,
    freeMemos,
    unovercomeCount: countUnovercomeReviewItems(views),
    error: null,
  };
}
