import { CircleCheck, CircleMinus, CircleX } from "lucide-react";
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
  return `未達成の要件を直して再提出すると、再レビューできます（有料会員は 1 日 ${AI_REVIEW_LIMITS.active.perContentPerDay} 回まで）`;
}

interface StructuredReviewProps {
  reviewJson: ReviewJson;
  scoreKind: ScoreKind;
  passDisplay: PassDisplay | null;
}

export function StructuredReview({ reviewJson, scoreKind, passDisplay }: StructuredReviewProps) {
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
              return (
                <li key={requirement.key} className="flex gap-2">
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_COLOR[requirement.status]}`}
                    aria-label={getRequirementStatusLabel(requirement.status)}
                  />
                  <div>
                    <p className="font-medium">
                      {requirement.name ?? requirement.key}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {getRequirementStatusLabel(requirement.status)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">{requirement.comment}</p>
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
          <p className="text-muted-foreground">{reviewJson.code_quality.comment}</p>
        </section>
      ) : (
        <section>
          <h4 className="mb-2 font-semibold">コード品質・可読性</h4>
          <p>
            <span className="font-medium">
              {getQualityLevelLabel(reviewJson.code_quality.level)}
            </span>
            <span className="text-muted-foreground"> — {reviewJson.code_quality.comment}</span>
          </p>
        </section>
      )}

      {reviewJson.suggestions.length > 0 && (
        <section>
          <h4 className="mb-2 font-semibold">改善提案</h4>
          <ol className="list-decimal space-y-1 pl-5">
            {reviewJson.suggestions.map((suggestion, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the list is never reordered and the AI may repeat a sentence, so the text isn't a unique key
              <li key={index}>{suggestion}</li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h4 className="mb-2 font-semibold">学習アドバイス</h4>
        <p>{reviewJson.advice}</p>
      </section>

      {passDisplay === "retry" && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          {retryGuidance()}
        </p>
      )}
    </div>
  );
}
