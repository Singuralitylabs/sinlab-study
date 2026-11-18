import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { MANAGE_PLAYGROUND_TEMPLATES_PATH } from "@/app/constants/playground";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { fetchManagePlaygroundTemplateById } from "@/app/services/api/playground-templates-server";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteConfirmButton } from "../../../../components/DeleteConfirmButton";

export default async function DeletePlaygroundTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const templateId = parsePositiveInteger((await params).id);
  if (templateId === null) {
    notFound();
  }
  const template = await fetchManagePlaygroundTemplateById(templateId);
  if (!template) {
    notFound();
  }

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="ひな形の削除" description="この操作は取り消せません" />
      <Card className="mt-6">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm">
              ひな形「<strong>{template.title}</strong>」を削除しますか？ 配ったリンクや QR
              コードは開けなくなります。
            </p>
          </div>
          <DeleteConfirmButton
            deleteUrl={`/api/manage/playground-templates/${templateId}`}
            backUrl={MANAGE_PLAYGROUND_TEMPLATES_PATH}
          />
        </CardContent>
      </Card>
    </div>
  );
}
