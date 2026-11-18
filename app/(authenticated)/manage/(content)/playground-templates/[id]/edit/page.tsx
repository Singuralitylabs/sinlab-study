import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { MANAGE_PLAYGROUND_TEMPLATES_PATH } from "@/app/constants/playground";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { fetchManagePlaygroundTemplateById } from "@/app/services/api/playground-templates-server";
import { PlaygroundTemplateForm } from "../../PlaygroundTemplateForm";

export default async function EditPlaygroundTemplatePage({
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
    <div className="max-w-6xl mx-auto">
      <PageTitle
        title="ひな形の編集"
        breadcrumbs={[
          { label: "コードを試す ひな形", href: MANAGE_PLAYGROUND_TEMPLATES_PATH },
          { label: template.title },
        ]}
      />
      <PlaygroundTemplateForm
        mode="edit"
        initialData={{
          id: template.id,
          title: template.title,
          kind: template.kind,
          files: template.files,
          isPublished: template.isPublished,
        }}
      />
    </div>
  );
}
