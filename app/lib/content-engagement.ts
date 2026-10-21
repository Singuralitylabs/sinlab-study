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

/** Roll-up over every content in a phase or theme; people are distinct students, not sums. */
export type EngagementGroupSummary = {
  contentCount: number;
  /** Students who viewed at least one content in the group. */
  viewedStudents: number;
  /** Students who completed every content in the group (0 when the group has no contents). */
  finishedStudents: number;
  /** sum(completedCount) / (contentCount * studentTotal); 0 when either is 0. */
  averageCompletionRate: number;
};

export type ContentEngagementPhaseGroup = {
  phaseId: number;
  phaseName: string;
  phaseOrder: number;
  summary: EngagementGroupSummary;
  contents: ContentEngagementStat[];
};

export type ContentEngagementThemeGroup = {
  themeId: number;
  themeName: string;
  themeOrder: number;
  summary: EngagementGroupSummary;
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

/** Learning order inside a phase, so rows match what students see; id breaks ties. */
export function compareEngagementByLearningOrder(
  a: ContentEngagementStat,
  b: ContentEngagementStat
): number {
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

function emptySummary(): EngagementGroupSummary {
  return { contentCount: 0, viewedStudents: 0, finishedStudents: 0, averageCompletionRate: 0 };
}

function summarizeGroup(
  contents: readonly ContentEngagementStat[],
  viewed: ReadonlyMap<number, ReadonlySet<number>>,
  completed: ReadonlyMap<number, ReadonlySet<number>>,
  studentTotal: number
): EngagementGroupSummary {
  if (contents.length === 0) return emptySummary();

  const viewers = new Set<number>();
  for (const content of contents) {
    for (const userId of viewed.get(content.contentId) ?? []) viewers.add(userId);
  }

  // Intersection of per-content completers: only students who finished every content count.
  const completers = contents.map(
    (content): ReadonlySet<number> => completed.get(content.contentId) ?? new Set<number>()
  );
  let finished = 0;
  for (const userId of completers[0] ?? []) {
    if (completers.every((done) => done.has(userId))) finished += 1;
  }

  const completedTotal = contents.reduce((sum, content) => sum + content.completedCount, 0);
  return {
    contentCount: contents.length,
    viewedStudents: viewers.size,
    finishedStudents: finished,
    averageCompletionRate: studentTotal > 0 ? completedTotal / (contents.length * studentTotal) : 0,
  };
}

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
        summary: emptySummary(),
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
        summary: emptySummary(),
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
      phase.contents.sort(compareEngagementByLearningOrder);
      phase.summary = summarizeGroup(phase.contents, viewed, completed, studentTotal);
    }
  }

  for (const theme of themes) {
    theme.summary = summarizeGroup(
      theme.phases.flatMap((phase) => phase.contents),
      viewed,
      completed,
      studentTotal
    );
  }

  return { studentTotal, themes };
}
