import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchPhaseById } from "@/app/services/api/admin-server";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteConfirmButton } from "../../../components/DeleteConfirmButton";

export default async function DeletePhasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const phaseId = Number.parseInt(id, 10);
  if (Number.isNaN(phaseId)) notFound();

  const { data: phase } = await fetchPhaseById(phaseId);
  if (!phase) notFound();

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="フェーズの削除" description="この操作は取り消せません" />
      <Card className="mt-6">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm">
              フェーズ「<strong>{phase.name}</strong>」を削除しますか？
              このフェーズに紐づく週・コンテンツの表示に影響する場合があります。
            </p>
          </div>
          <DeleteConfirmButton
            deleteUrl={`/api/manage/phases/${phaseId}`}
            backUrl="/manage/phases"
          />
        </CardContent>
      </Card>
    </div>
  );
}
