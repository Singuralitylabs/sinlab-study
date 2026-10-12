import type { Tables } from "./lib/database.types";

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./lib/database.types";

export type UserType = Tables<"users"> & {
  role: UserRoleType;
  status: UserStatusType;
  membership_type: MembershipType | null;
  is_deleted: boolean;
};
export type LearningTheme = Tables<"learning_themes"> & {
  display_order: number;
  is_published: boolean;
  is_deleted: boolean;
};
export type LearningPhase = Tables<"learning_phases"> & {
  display_order: number;
  is_published: boolean;
  is_deleted: boolean;
};
export type LearningWeek = Tables<"learning_weeks"> & {
  display_order: number;
  is_published: boolean;
  is_deleted: boolean;
};
export type LearningContent = Tables<"learning_contents"> & {
  content_type: ContentType;
  display_order: number;
  is_published: boolean;
  is_deleted: boolean;
};
export type UserProgress = Tables<"user_progress"> & {
  is_completed: boolean;
};
export type Submission = Tables<"submissions"> & {
  submission_type: SubmissionType;
};
export type AIReview = Omit<Tables<"ai_reviews">, "review_json" | "score_kind"> & {
  status: AIReviewStatus;
  review_json: ReviewJson | null;
  score_kind: ScoreKind;
};

export type UserStatusType = "trial" | "active" | "rejected";
export type UserRoleType = "admin" | "maintainer" | "member";
/** null for unapproved and rejected users. */
export type MembershipType = "community" | "general";
export type ContentType = "video" | "text" | "exercise" | "slide";
export type SubmissionType = "code" | "url";
export type AIReviewStatus = "pending" | "processing" | "completed" | "failed";

export type RequirementStatus = "met" | "partial" | "unmet";
export type QualityLevel = "good" | "fair" | "poor";
/**
 * rubric = graded against the exercise's grading rubric; estimated = no rubric, the AI guessed the
 * requirements (reference only); none = URL submission (not graded); legacy = free-text review
 * from before structured grading.
 */
export type ScoreKind = "rubric" | "estimated" | "none" | "legacy";

/** Defined as `type` (not `interface`) so it is assignable to Supabase's Json. */
export type GradingRequirement = {
  key: string;
  name: string;
  description: string;
};

export type GradingRubric = {
  version: number;
  requirements: GradingRequirement[];
};

/**
 * `name` is stored beside `key` so a review stays readable after the rubric is edited (the rubric
 * can change version afterwards). The AI only ever returns `key` for rubric grading; the code
 * fills `name` from the rubric.
 */
export type ReviewRequirementResult = {
  key: string;
  name?: string;
  status: RequirementStatus;
  comment: string;
};

export type ReviewJson = {
  requirements: ReviewRequirementResult[];
  code_quality: { level: QualityLevel; comment: string };
  suggestions: string[];
  advice: string;
};

/**
 * One file of a multi-file submission (submissions.code_files element). language/filename may be
 * empty for compatibility with single-file submissions (code_content). Defined as `type`, not
 * `interface`: assigning to Supabase's Json type needs an implicit index signature.
 */
export type CodeFile = {
  filename: string;
  language: string;
  content: string;
};

export interface LearningPhaseWithTheme extends LearningPhase {
  theme: LearningTheme | null;
}

export interface LearningWeekWithPhase extends LearningWeek {
  phase: LearningPhaseWithTheme | null;
}

export interface LearningContentWithWeek extends LearningContent {
  week: LearningWeekWithPhase | null;
}

export type LearningContentListItem = Pick<
  LearningContent,
  | "id"
  | "week_id"
  | "title"
  | "content_type"
  | "video_url"
  | "pdf_url"
  | "is_open_to_trial"
  | "is_published"
  | "is_deleted"
  | "display_order"
  | "created_at"
  | "updated_at"
>;

export type ManageThemeListItem = Pick<
  LearningTheme,
  "id" | "name" | "description" | "image_url" | "display_order" | "is_published"
>;

export type ManagePhaseListItem = Pick<
  LearningPhase,
  "id" | "name" | "description" | "display_order" | "is_published" | "theme_id"
> & {
  theme: Pick<LearningTheme, "id" | "name" | "display_order"> | null;
};

export type ManageWeekListItem = Pick<
  LearningWeek,
  "id" | "name" | "display_order" | "is_published" | "phase_id"
> & {
  phase:
    | (Pick<LearningPhase, "id" | "name" | "display_order" | "theme_id"> & {
        theme: Pick<LearningTheme, "id" | "name" | "display_order"> | null;
      })
    | null;
};

export type ManageContentListItem = Pick<
  LearningContent,
  | "id"
  | "title"
  | "content_type"
  | "display_order"
  | "is_published"
  | "is_open_to_trial"
  | "week_id"
  | "grading_rubric"
> & {
  week: ManageWeekListItem | null;
};

export type ContentSiblingCandidateRow = Pick<
  LearningContent,
  "id" | "title" | "display_order" | "is_published" | "week_id"
>;

export type ManageUserListItem = Pick<
  UserType,
  | "id"
  | "display_name"
  | "email"
  | "role"
  | "status"
  | "membership_type"
  | "created_at"
  | "email_opt_out_at"
>;

export type BreadcrumbTheme = Pick<LearningTheme, "id" | "name" | "is_published" | "is_deleted">;

export type BreadcrumbPhase = Pick<
  LearningPhase,
  "id" | "theme_id" | "name" | "is_published" | "is_deleted"
> & {
  theme: BreadcrumbTheme | null;
};

export type BreadcrumbWeek = Pick<
  LearningWeek,
  "id" | "phase_id" | "name" | "is_published" | "is_deleted"
> & {
  phase: BreadcrumbPhase | null;
};

export type LearningWeekWithBreadcrumb = LearningWeek & {
  phase: BreadcrumbPhase | null;
};

export type LearningContentWithBreadcrumb = LearningContent & {
  week: BreadcrumbWeek | null;
};

export interface SubmissionWithContent extends Submission {
  content: Pick<
    LearningContent,
    "id" | "title" | "content_type" | "is_published" | "is_open_to_trial" | "week_id"
  > | null;
}

/** Columns students may read. Token counts are admin-only (AdminAIReviewListItem). */
export type AIReviewListItem = Pick<
  AIReview,
  | "id"
  | "status"
  | "overall_score"
  | "review_content"
  | "reviewed_at"
  | "error_message"
  | "review_json"
  | "score_kind"
  | "rubric_version"
  | "passed"
>;

export type AdminAIReviewListItem = AIReviewListItem &
  Pick<AIReview, "prompt_tokens" | "completion_tokens" | "thoughts_tokens">;

export interface SubmissionWithContentAndReview extends Submission {
  content: Pick<LearningContent, "id" | "title"> | null;
  ai_review: AIReviewListItem | null;
}

export interface AdminSubmissionWithReview
  extends Omit<SubmissionWithContentAndReview, "ai_review"> {
  user: Pick<UserType, "id" | "display_name" | "email"> | null;
  ai_review: AdminAIReviewListItem | null;
}

export interface ThemeProgress {
  theme: LearningTheme;
  totalContents: number;
  completedContents: number;
  progressPercent: number;
}

export interface PhaseProgress {
  phase: LearningPhase;
  totalContents: number;
  completedContents: number;
  progressPercent: number;
}

export interface WeekProgress {
  week: LearningWeek;
  totalContents: number;
  completedContents: number;
  progressPercent: number;
}

export type Announcement = Tables<"announcements">;
