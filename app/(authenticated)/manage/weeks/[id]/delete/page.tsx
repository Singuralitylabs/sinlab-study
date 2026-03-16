import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchWeekById } from "@/app/services/api/admin-server";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteConfirmButton } from "../../../components/DeleteConfirmButton";

export default async function DeleteWeekPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const weekId = Number.parseInt(id, 10);
  if (Number.isNaN(weekId)) notFound();

  const { data: week } = await fetchWeekById(weekId);
  if (!week) notFound();

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="週の削除" description="この操作は取り消せません" />
      <Card className="mt-6">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm">
              週「<strong>{week.name}</strong>」を削除しますか？
              この週に紐づくコンテンツの表示に影響する場合があります。
            </p>
          </div>
          <DeleteConfirmButton deleteUrl={`/api/manage/weeks/${weekId}`} backUrl="/manage/weeks" />
        </CardContent>
      </Card>
    </div>
  );
}
