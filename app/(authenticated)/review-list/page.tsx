import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { isAiChatEnabled } from "@/app/constants/ai-chat";
import {
  buildReviewListForUser,
  buildSavedChatNotesForUser,
} from "@/app/services/api/review-list-server";
import { isLearnerRole } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { ReviewListClient } from "./ReviewListClient";

export default async function ReviewListPage() {
  const { userId, userRole } = await getServerAuth();

  if (userId === null || !isLearnerRole(userRole)) {
    redirect("/");
  }

  const [{ unovercome, overcome, orphanMemos, freeMemos, error }, saved] = await Promise.all([
    buildReviewListForUser(userId),
    buildSavedChatNotesForUser(userId),
  ]);
  // Saved answers stay visible after the chat is switched off (#569 17.1).
  const savedChatNotes =
    isAiChatEnabled() || saved.notes.length > 0 || saved.error
      ? { notes: saved.notes, loadFailed: saved.error !== null }
      : null;

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="復習リスト"
        description="AIレビューで部分的・未達成になった要件を集めました。再提出で達成（met）になると克服済みに移ります。参考採点の項目は最新のレビュー内容に置き換わります。"
      />
      {error ? (
        <p className="text-sm text-destructive py-8 text-center">
          復習リストの取得に失敗しました。時間をおいて再読み込みしてください。
        </p>
      ) : (
        <ReviewListClient
          unovercome={unovercome}
          overcome={overcome}
          orphanMemos={orphanMemos}
          freeMemos={freeMemos}
          savedChatNotes={savedChatNotes}
        />
      )}
    </div>
  );
}
