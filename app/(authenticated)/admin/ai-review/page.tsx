import { PageTitle } from "@/app/components/PageTitle";
import { AI_CHAT_LIMIT_BOUNDS, AI_CHAT_LIMITS } from "@/app/constants/ai-chat";
import { AI_REVIEW_LIMIT_BOUNDS, AI_REVIEW_LIMITS } from "@/app/constants/gemini";
import { formatDateTimeMinute } from "@/app/lib/format-date";
import { fetchAIChatSettingsForAdmin } from "@/app/services/api/ai-chat-server";
import { fetchAIReviewSettingsForAdmin } from "@/app/services/api/ai-review-settings-server";
import { AiChatSettingsForm } from "./ai-chat-settings-form";
import { AiReviewSettingsForm } from "./ai-review-settings-form";

function LastUpdated({
  updatedAt,
  updatedByName,
}: {
  updatedAt: string | null;
  updatedByName: string | null;
}) {
  return (
    <p className="text-xs text-muted-foreground">
      最終更新:{" "}
      {updatedAt
        ? `${formatDateTimeMinute(updatedAt)}${updatedByName ? `（${updatedByName}）` : ""}`
        : "初期値"}
      。変更は次のリクエストから反映されます。すでに使った回数は変わりません。
    </p>
  );
}

export default async function AdminAiReviewPage() {
  const [{ data, error }, chat] = await Promise.all([
    fetchAIReviewSettingsForAdmin(),
    fetchAIChatSettingsForAdmin(),
  ]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="AIレビューの回数上限"
        description="受講生が受けられる AI レビューと「シンラビに相談」の回数上限を変更できます"
      />

      {error || !data ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <>
          <LastUpdated updatedAt={data.updatedAt} updatedByName={data.updatedByName} />
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

      <section className="space-y-3 pt-4">
        <h2 className="text-lg font-semibold">シンラビに相談（AIチャット）の回数上限</h2>
        {chat.error || !chat.data ? (
          <p className="text-destructive text-sm">{chat.error}</p>
        ) : (
          <>
            <LastUpdated updatedAt={chat.data.updatedAt} updatedByName={chat.data.updatedByName} />
            {chat.data.usingDefaults && (
              <p className="text-xs text-muted-foreground">
                保存された値が読めない、または範囲外のため、標準の値（有料会員1日
                {AI_CHAT_LIMITS.activePerDay}回・お試し通算{AI_CHAT_LIMITS.trialLifetime}
                回）が使われています。保存すると上書きされます。
              </p>
            )}
            <AiChatSettingsForm limits={chat.data.limits} bounds={AI_CHAT_LIMIT_BOUNDS} />
          </>
        )}
      </section>
    </div>
  );
}
