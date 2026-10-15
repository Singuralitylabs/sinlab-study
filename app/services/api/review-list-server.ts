import type { PostgrestError } from "@supabase/supabase-js";
import { compareGroupLevel } from "@/app/lib/content-grouping";
import { buildThemeContentOrder, type NavigationWeek } from "@/app/lib/content-navigation";
import {
  countUnovercomeReviewItems,
  deriveReviewListItems,
  type DerivedReviewItem,
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
  weekId: number;
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

type ContentRow = {
  id: number;
  title: string;
  display_order: number | null;
  week_id: number;
};

type ThemeRow = {
  id: number;
  name: string;
  display_order: number | null;
  phases: {
    id: number;
    name: string;
    display_order: number | null;
    weeks: {
      id: number;
      name: string;
      display_order: number | null;
      contents: ContentRow[];
    }[];
  }[];
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
  const { data, error } = await supabase
    .from("learning_themes")
    .select(
      "id, name, display_order, phases:learning_phases(id, name, display_order, weeks:learning_weeks(id, name, display_order, contents:learning_contents(id, title, display_order, week_id)))"
    )
    .eq("is_published", true)
    .eq("is_deleted", false)
    .eq("phases.is_published", true)
    .eq("phases.is_deleted", false)
    .eq("phases.weeks.is_published", true)
    .eq("phases.weeks.is_deleted", false)
    .eq("phases.weeks.contents.is_published", true)
    .eq("phases.weeks.contents.is_deleted", false)
    .order("display_order");

  if (error) {
    console.error("復習リスト用コンテンツ順取得エラー:", error.message);
    return { metas: new Map(), order: new Map(), error };
  }

  const themes = [...((data ?? []) as ThemeRow[])].sort((a, b) =>
    compareGroupLevel(a.display_order, b.display_order, a.id, b.id)
  );

  const metas = new Map<number, ReviewListContentMeta>();
  const order = new Map<number, number>();
  let rank = 0;

  for (const theme of themes) {
    const weeks: NavigationWeek[] = theme.phases.flatMap((phase) =>
      phase.weeks.map((week) => ({
        id: week.id,
        name: week.name,
        display_order: week.display_order,
        phase: {
          id: phase.id,
          name: phase.name,
          display_order: phase.display_order,
        },
      }))
    );
    const contents = theme.phases.flatMap((phase) =>
      phase.weeks.flatMap((week) => week.contents)
    );
    const ordered = buildThemeContentOrder(weeks, contents);
    for (const content of ordered) {
      order.set(content.id, rank);
      rank += 1;
      metas.set(content.id, {
        contentId: content.id,
        title: content.title,
        themeId: theme.id,
        themeName: theme.name,
        phaseId: content.phaseId,
        weekId: content.weekId,
        href: `/learn/${theme.id}/${content.phaseId}/${content.weekId}/${content.id}`,
      });
    }
  }

  return { metas, order, error: null };
}

export async function buildReviewListForUser(userId: number): Promise<{
  unovercome: ReviewListItemView[];
  overcome: ReviewListItemView[];
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
      freeMemos: [],
      unovercomeCount: 0,
      error: reviewsResult.error ?? notesResult.error ?? contentResult.error,
    };
  }

  const derived = deriveReviewListItems(reviewsResult.data);
  const sorted = sortReviewItemsByLearningOrder(derived, contentResult.order);

  const noteByKey = new Map<string, ReviewNoteRow>();
  for (const note of notesResult.data) {
    noteByKey.set(`${note.content_id}:${note.requirement_key ?? ""}`, note);
  }

  const toView = (item: DerivedReviewItem): ReviewListItemView | null => {
    const meta = contentResult.metas.get(item.contentId);
    if (!meta) return null;
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

  const views = sorted.map(toView).filter((item): item is ReviewListItemView => item != null);
  const unovercome = views.filter((item) => !item.overcome);
  const overcome = views.filter((item) => item.overcome);

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
    freeMemos,
    unovercomeCount: countUnovercomeReviewItems(views),
    error: null,
  };
}

/** Home / weekly digest: count only. Avoids assembling full view models. */
export async function countUnovercomeReviewItemsForUser(userId: number): Promise<number> {
  const { data, error } = await fetchReviewListSourceReviews(userId);
  if (error) {
    return 0;
  }
  return countUnovercomeReviewItems(deriveReviewListItems(data));
}
