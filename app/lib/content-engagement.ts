import type { ContentType } from "@/app/types";

export type ContentEngagementStat = {
  contentId: number;
  title: string;
  contentType: ContentType;
  phaseId: number;
  phaseName: string;
  phaseOrder: number;
  themeId: number;
  themeName: string;
  themeOrder: number;
  contentOrder: number;
  viewedCount: number;
  completedCount: number;
  /** completedCount / studentTotal. 0 when there are no students. */
  completionRate: number;
  /** Exercise only; null for other types. */
  submissionCount: number | null;
  /** Distinct submitters with at least one passed review; exercise only. */
  passedCount: number | null;
  /** passedCount / distinct submitters; null when not exercise or no submitters. */
  passRate: number | null;
};

export type ContentEngagementPhaseGroup = {
  phaseId: number;
  phaseName: string;
  phaseOrder: number;
  contents: ContentEngagementStat[];
};

export type ContentEngagementThemeGroup = {
  themeId: number;
  themeName: string;
  themeOrder: number;
  phases: ContentEngagementPhaseGroup[];
};

export type ContentEngagementResult = {
  studentTotal: number;
  themes: ContentEngagementThemeGroup[];
};

export function completionRate(completedCount: number, studentTotal: number): number {
  if (studentTotal <= 0) return 0;
  return completedCount / studentTotal;
}

export function passRate(passedCount: number, submitterCount: number): number | null {
  if (submitterCount <= 0) return null;
  return passedCount / submitterCount;
}

/** Lower completion first; then fewer views; stable by contentOrder / id. */
export function compareEngagementForSort(
  a: ContentEngagementStat,
  b: ContentEngagementStat
): number {
  if (a.completionRate !== b.completionRate) {
    return a.completionRate - b.completionRate;
  }
  if (a.viewedCount !== b.viewedCount) {
    return a.viewedCount - b.viewedCount;
  }
  if (a.contentOrder !== b.contentOrder) {
    return a.contentOrder - b.contentOrder;
  }
  return a.contentId - b.contentId;
}

export type ProgressAggRow = {
  content_id: number;
  user_id: number;
  is_completed: boolean | null;
  last_viewed_at: string | null;
};

export type SubmissionAggRow = {
  content_id: number;
  user_id: number;
  passed: boolean | null;
};

type ContentMeta = {
  id: number;
  title: string;
  content_type: ContentType;
  display_order: number;
  phase_id: number;
  phase_name: string;
  phase_order: number;
  theme_id: number;
  theme_name: string;
  theme_order: number;
};

/**
 * Pure aggregation for unit tests. `studentIds` is the denominator set (active, not deleted).
 * Progress / submissions from users outside that set are ignored.
 */
export function buildContentEngagement(
  contents: ContentMeta[],
  studentIds: ReadonlySet<number>,
  progressRows: ProgressAggRow[],
  submissionRows: SubmissionAggRow[],
  studentTotal: number
): ContentEngagementResult {
  const viewed = new Map<number, Set<number>>();
  const completed = new Map<number, Set<number>>();

  for (const row of progressRows) {
    if (!studentIds.has(row.user_id)) continue;
    if (row.last_viewed_at) {
      let set = viewed.get(row.content_id);
      if (!set) {
        set = new Set();
        viewed.set(row.content_id, set);
      }
      set.add(row.user_id);
    }
    if (row.is_completed === true) {
      let set = completed.get(row.content_id);
      if (!set) {
        set = new Set();
        completed.set(row.content_id, set);
      }
      set.add(row.user_id);
    }
  }

  const submissionsByContent = new Map<number, { submitters: Set<number>; passers: Set<number> }>();
  for (const row of submissionRows) {
    if (!studentIds.has(row.user_id)) continue;
    let bucket = submissionsByContent.get(row.content_id);
    if (!bucket) {
      bucket = { submitters: new Set(), passers: new Set() };
      submissionsByContent.set(row.content_id, bucket);
    }
    bucket.submitters.add(row.user_id);
    if (row.passed === true) {
      bucket.passers.add(row.user_id);
    }
  }

  const themeMap = new Map<number, ContentEngagementThemeGroup>();

  for (const content of contents) {
    const viewedCount = viewed.get(content.id)?.size ?? 0;
    const completedCount = completed.get(content.id)?.size ?? 0;
    const isExercise = content.content_type === "exercise";
    const sub = submissionsByContent.get(content.id);
    const submitterCount = sub?.submitters.size ?? 0;
    const passedCount = sub?.passers.size ?? 0;

    const stat: ContentEngagementStat = {
      contentId: content.id,
      title: content.title,
      contentType: content.content_type,
      phaseId: content.phase_id,
      phaseName: content.phase_name,
      phaseOrder: content.phase_order,
      themeId: content.theme_id,
      themeName: content.theme_name,
      themeOrder: content.theme_order,
      contentOrder: content.display_order,
      viewedCount,
      completedCount,
      completionRate: completionRate(completedCount, studentTotal),
      submissionCount: isExercise ? submitterCount : null,
      passedCount: isExercise ? passedCount : null,
      passRate: isExercise ? passRate(passedCount, submitterCount) : null,
    };

    let theme = themeMap.get(content.theme_id);
    if (!theme) {
      theme = {
        themeId: content.theme_id,
        themeName: content.theme_name,
        themeOrder: content.theme_order,
        phases: [],
      };
      themeMap.set(content.theme_id, theme);
    }

    let phase = theme.phases.find((p) => p.phaseId === content.phase_id);
    if (!phase) {
      phase = {
        phaseId: content.phase_id,
        phaseName: content.phase_name,
        phaseOrder: content.phase_order,
        contents: [],
      };
      theme.phases.push(phase);
    }
    phase.contents.push(stat);
  }

  const themes = [...themeMap.values()].sort((a, b) => {
    if (a.themeOrder !== b.themeOrder) return a.themeOrder - b.themeOrder;
    return a.themeId - b.themeId;
  });

  for (const theme of themes) {
    theme.phases.sort((a, b) => {
      if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
      return a.phaseId - b.phaseId;
    });
    for (const phase of theme.phases) {
      phase.contents.sort(compareEngagementForSort);
    }
  }

  return { studentTotal, themes };
}
