import type { Tables } from "./lib/database.types";

// Re-export database types utility
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./lib/database.types";

// =====================================================
// Base types derived from database schema
// =====================================================

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
export type AIReview = Tables<"ai_reviews"> & {
  status: AIReviewStatus;
};

// =====================================================
// Enum-like types (narrower than DB string type)
// =====================================================

export type UserStatusType = "trial" | "active" | "rejected";
export type UserRoleType = "admin" | "maintainer" | "member";
/** 承認済みユーザーの会員種別。承認前・却下ユーザーは null */
export type MembershipType = "community" | "general";
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

/** コンテンツ一覧用（本文・演習指示・模範解答・ヒント等の重いカラムを含まない） */
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

/**
 * 管理画面一覧用のカラム絞り込み型（#196）。
 * `fetchAllThemes` / `fetchAllPhases` / `fetchAllWeeks` / `fetchAllContents` が返す形に合わせる。
 */
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
> & {
  week: ManageWeekListItem | null;
};

/** コンテンツ挿入位置ピッカー用の兄弟候補（#196） */
export type ContentSiblingCandidateRow = Pick<
  LearningContent,
  "id" | "title" | "display_order" | "is_published" | "week_id"
>;

/** ユーザー管理一覧用（#196。ページネーションは追加しない） */
export type ManageUserListItem = Pick<
  UserType,
  "id" | "display_name" | "email" | "role" | "status" | "membership_type" | "created_at"
>;

/** パンくず・所属判定用のテーマ（ネスト取得の最小セット） */
export type BreadcrumbTheme = Pick<LearningTheme, "id" | "name" | "is_published" | "is_deleted">;

/** パンくず・所属判定用のフェーズ */
export type BreadcrumbPhase = Pick<
  LearningPhase,
  "id" | "theme_id" | "name" | "is_published" | "is_deleted"
> & {
  theme: BreadcrumbTheme | null;
};

/** パンくず・所属判定用の週 */
export type BreadcrumbWeek = Pick<
  LearningWeek,
  "id" | "phase_id" | "name" | "is_published" | "is_deleted"
> & {
  phase: BreadcrumbPhase | null;
};

/** 週詳細（本体は全カラム、親フェーズ/テーマはパンくず用） */
export type LearningWeekWithBreadcrumb = LearningWeek & {
  phase: BreadcrumbPhase | null;
};

/** コンテンツ詳細（本体は全カラム、親階層はパンくず用） */
export type LearningContentWithBreadcrumb = LearningContent & {
  week: BreadcrumbWeek | null;
};

export interface SubmissionWithContent extends Submission {
  content: Pick<
    LearningContent,
    "id" | "title" | "content_type" | "is_published" | "is_open_to_trial" | "week_id"
  > | null;
}

/** 提出一覧表示用の ai_reviews（token 等のメタは含めない） */
export type AIReviewListItem = Pick<
  AIReview,
  "id" | "status" | "overall_score" | "review_content" | "reviewed_at" | "error_message"
>;

/** 受講生向け提出+レビュー一覧（content / ai_review は一覧表示用の最小カラムのみ） */
export interface SubmissionWithContentAndReview extends Submission {
  content: Pick<LearningContent, "id" | "title"> | null;
  ai_review: AIReviewListItem | null;
}

/** 管理者・講師向け提出一覧の1件（受講生一覧＋提出者情報） */
export interface AdminSubmissionWithReview extends SubmissionWithContentAndReview {
  user: Pick<UserType, "id" | "display_name" | "email"> | null;
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
