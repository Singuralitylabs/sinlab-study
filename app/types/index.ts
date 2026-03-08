// User types
export type UserStatusType = "pending" | "active" | "rejected";
export type UserRoleType = "admin" | "maintainer" | "member";

export interface UserType {
  id: number;
  auth_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRoleType;
  status: UserStatusType;
  bio: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

// Learning content types
export type ContentType = "video" | "text" | "exercise" | "slide";

export interface LearningTheme {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_published: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearningPhase {
  id: number;
  theme_id: number;
  name: string;
  description: string | null;
  display_order: number;
  is_published: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearningWeek {
  id: number;
  phase_id: number;
  name: string;
  description: string | null;
  display_order: number;
  is_published: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearningContent {
  id: number;
  week_id: number;
  title: string;
  content_type: ContentType;
  video_url: string | null;
  text_content: string | null;
  exercise_instructions: string | null;
  pdf_url: string | null;
  display_order: number;
  is_published: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProgress {
  id: number;
  user_id: number;
  content_id: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export type SubmissionType = "code" | "url";

export interface Submission {
  id: number;
  user_id: number;
  content_id: number;
  submission_type: SubmissionType;
  code_content: string | null;
  url: string | null;
  submitted_at: string;
  created_at: string;
}

// Extended types with relations
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

// AI Review types
export type AIReviewStatus = "pending" | "processing" | "completed" | "failed";

export interface AIReview {
  id: number;
  submission_id: number;
  status: AIReviewStatus;
  review_content: string | null;
  overall_score: number | null;
  model_used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error_message: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionWithContentAndReview extends SubmissionWithContent {
  ai_review: AIReview | null;
}

export interface SubmissionWithUserAndReview extends SubmissionWithUser {
  ai_review: AIReview | null;
}

// Progress summary types
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
