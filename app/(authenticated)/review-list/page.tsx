import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { buildReviewListForUser } from "@/app/services/api/review-list-server";
import { isLearnerRole } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { ReviewListClient } from "./ReviewListClient";

export default async function ReviewListPage() {
  const { userId, userRole } = await getServerAuth();

  if (userId === null || !isLearnerRole(userRole)) {
    redirect("/");
  }

  const { unovercome, overcome, freeMemos, error } = await buildReviewListForUser(userId);

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
        <ReviewListClient unovercome={unovercome} overcome={overcome} freeMemos={freeMemos} />
      )}
    </div>
  );
}
