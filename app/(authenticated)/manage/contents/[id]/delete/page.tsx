import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchContentByIdForAdmin } from "@/app/services/api/admin-server";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteConfirmButton } from "../../../components/DeleteConfirmButton";

export default async function DeleteContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contentId = Number.parseInt(id, 10);
  if (Number.isNaN(contentId)) notFound();

  const { data: content } = await fetchContentByIdForAdmin(contentId);
  if (!content) notFound();

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="コンテンツの削除" description="この操作は取り消せません" />
      <Card className="mt-6">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm">
              コンテンツ「<strong>{content.title}</strong>」を削除しますか？
              受講生の進捗・提出物データも参照できなくなる場合があります。
            </p>
          </div>
          <DeleteConfirmButton
            deleteUrl={`/api/manage/contents/${contentId}`}
            backUrl="/manage/contents"
          />
        </CardContent>
      </Card>
    </div>
  );
}
