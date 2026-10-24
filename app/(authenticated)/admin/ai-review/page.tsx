import { PageTitle } from "@/app/components/PageTitle";
import { AI_REVIEW_LIMIT_BOUNDS, AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import { formatDateTimeMinute } from "@/app/lib/format-date";
import { fetchAIReviewSettingsForAdmin } from "@/app/services/api/ai-review-settings-server";
import { AiReviewSettingsForm } from "./ai-review-settings-form";

export default async function AdminAiReviewPage() {
  const { data, error } = await fetchAIReviewSettingsForAdmin();

  return (
    <div className="space-y-6">
      <PageTitle
        title="AIレビューの回数上限"
        description="受講生が受けられる AI レビューの回数上限を変更できます"
      />

      {error || !data ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            最終更新:{" "}
            {data.updatedAt
              ? `${formatDateTimeMinute(data.updatedAt)}${data.updatedByName ? `（${data.updatedByName}）` : ""}`
              : "初期値"}
            。変更は次のリクエストから反映されます。すでに使った回数は変わりません。
          </p>
          {data.usingDefaults && (
            <p className="text-xs text-muted-foreground">
              保存された値が読めない、または範囲外のため、標準の値（1課題1日
              {AI_REVIEW_LIMITS.active.perContentPerDay}回・全課題合計
              {AI_REVIEW_LIMITS.active.perDay}回・お試し{AI_REVIEW_LIMITS.trial.perContentLifetime}
              回）が使われています。保存すると上書きされます。
            </p>
          )}
          <AiReviewSettingsForm limits={data.limits} bounds={AI_REVIEW_LIMIT_BOUNDS} />
        </>
      )}
    </div>
  );
}
