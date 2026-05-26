import type { Tables } from "./lib/database.types";

// Re-export database types utility
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./lib/database.types";

// =====================================================
// Base types derived from database schema
// =====================================================

export type UserType = Tables<"users"> & {
  role: UserRoleType;
  status: UserStatusType;
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
export type AIReview = Tables<"ai_reviews"> & {
  status: AIReviewStatus;
};

// =====================================================
// Enum-like types (narrower than DB string type)
// =====================================================

export type UserStatusType = "pending" | "active" | "rejected";
export type UserRoleType = "admin" | "maintainer" | "member";
export type ContentType = "video" | "text" | "exercise" | "slide";
export type SubmissionType = "code" | "url";
export type AIReviewStatus = "pending" | "processing" | "completed" | "failed";

/**
 * 複数ファイル提出の1ファイル分（submissions.code_files の各要素）。
 * 単一ファイル提出（code_content）との後方互換のため、language/filename は空文字を許容する。
 *
 * （interface ではなく type で定義する: Supabase 生成の Json 型へ代入する際に
 * 暗黙のインデックスシグネチャが必要なため）
 */
export type CodeFile = {
  filename: string;
  language: string;
  content: string;
};

// =====================================================
// Extended types with relations
// =====================================================

export interface LearningPhaseWithTheme extends LearningPhase {
  theme: LearningTheme | null;
}

export interface LearningWeekWithPhase extends LearningWeek {
  phase: LearningPhaseWithTheme | null;
}

export interface LearningContentWithWeek extends LearningContent {
  week: LearningWeekWithPhase | null;
}

export interface SubmissionWithContent extends Submission {
  content: LearningContent | null;
}

export interface SubmissionWithUser extends Submission {
  user: Pick<UserType, "id" | "display_name" | "email"> | null;
  content: LearningContent | null;
}

export interface SubmissionWithContentAndReview extends SubmissionWithContent {
  ai_review: AIReview | null;
}

export interface SubmissionWithUserAndReview extends SubmissionWithUser {
  ai_review: AIReview | null;
}

// =====================================================
// Progress summary types
// =====================================================

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
