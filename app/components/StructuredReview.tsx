import { CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { ReviewNoteMemoField } from "@/app/components/ReviewNoteEditor";
import { AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import {
  getQualityLevelLabel,
  getRequirementStatusLabel,
  type PassDisplay,
  SCORE_KIND_NOTES,
} from "@/app/lib/grading";
import type { RequirementStatus, ReviewJson, ScoreKind } from "@/app/types";

const STATUS_ICON: Record<RequirementStatus, typeof CircleCheck> = {
  met: CircleCheck,
  partial: CircleMinus,
  unmet: CircleX,
};

const STATUS_COLOR: Record<RequirementStatus, string> = {
  met: "text-success",
  partial: "text-muted-foreground",
  unmet: "text-destructive",
};

export function retryGuidance(): string {
  return `未達成の要件を直して再提出すると、再レビューできます（有料会員は 1 課題につき 1 日 ${AI_REVIEW_LIMITS.active.perContentPerDay} 回、全課題の合計で 1 日 ${AI_REVIEW_LIMITS.active.perDay} 回まで）`;
}

interface StructuredReviewProps {
  reviewJson: ReviewJson;
  scoreKind: ScoreKind;
  passDisplay: PassDisplay | null;
  /** When set, partial/unmet rows show the review-list cue and an inline memo field. */
  contentId?: number;
  /** Existing memos keyed by requirement key (from review_notes). Plain object for RSC props. */
  memosByKey?: Readonly<Record<string, string | null>>;
}

export function StructuredReview({
  reviewJson,
  scoreKind,
  passDisplay,
  contentId,
  memosByKey,
}: StructuredReviewProps) {
  return (
    <div className="space-y-4 text-sm">
      {SCORE_KIND_NOTES[scoreKind] && (
        <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
          {SCORE_KIND_NOTES[scoreKind]}
        </p>
      )}

      {reviewJson.requirements.length > 0 && (
        <section>
          <h4 className="mb-2 font-semibold">要件達成度</h4>
          <ul className="space-y-2">
            {reviewJson.requirements.map((requirement) => {
              const Icon = STATUS_ICON[requirement.status];
              const showReviewListCue =
                contentId != null &&
                (requirement.status === "partial" || requirement.status === "unmet");
              return (
                <li key={requirement.key} className="flex gap-2">
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_COLOR[requirement.status]}`}
                    aria-label={getRequirementStatusLabel(requirement.status)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {requirement.name ?? requirement.key}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {getRequirementStatusLabel(requirement.status)}
                      </span>
                    </p>
                    <MarkdownRenderer
                      content={requirement.comment}
                      className="prose-sm text-muted-foreground"
                    />
                    {showReviewListCue && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground">復習リストに追加されました</p>
                        <ReviewNoteMemoField
                          contentId={contentId}
                          requirementKey={requirement.key}
                          initialMemo={memosByKey?.[requirement.key] ?? null}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {scoreKind === "none" ? (
        <section>
          <h4 className="mb-2 font-semibold">補足</h4>
          <MarkdownRenderer
            content={reviewJson.code_quality.comment}
            className="prose-sm text-muted-foreground"
          />
        </section>
      ) : (
        <section>
          <h4 className="mb-2 font-semibold">コード品質・可読性</h4>
          <p className="font-medium">{getQualityLevelLabel(reviewJson.code_quality.level)}</p>
          <MarkdownRenderer content={reviewJson.code_quality.comment} className="prose-sm" />
        </section>
      )}

      {reviewJson.suggestions.length > 0 && (
        <section>
          <h4 className="mb-2 font-semibold">改善提案</h4>
          <ol className="list-decimal space-y-1 pl-5">
            {reviewJson.suggestions.map((suggestion, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the list is never reordered and the AI may repeat a sentence, so the text isn't a unique key
              <li key={index}>
                <MarkdownRenderer content={suggestion} className="prose-sm" />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h4 className="mb-2 font-semibold">学習アドバイス</h4>
        <MarkdownRenderer content={reviewJson.advice} className="prose-sm" />
      </section>

      {passDisplay === "retry" && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          {retryGuidance()}
        </p>
      )}
    </div>
  );
}
