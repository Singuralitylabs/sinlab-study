import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchThemeById } from "@/app/services/api/admin-server";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteConfirmButton } from "../../../components/DeleteConfirmButton";

export default async function DeleteThemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const themeId = Number.parseInt(id, 10);
  if (Number.isNaN(themeId)) notFound();

  const { data: theme } = await fetchThemeById(themeId);
  if (!theme) notFound();

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="テーマの削除" description="この操作は取り消せません" />
      <Card className="mt-6">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm">
              テーマ「<strong>{theme.name}</strong>」を削除しますか？
              このテーマに紐づくフェーズ・週・コンテンツの表示に影響する場合があります。
            </p>
          </div>
          <DeleteConfirmButton
            deleteUrl={`/api/manage/themes/${themeId}`}
            backUrl="/manage/themes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
