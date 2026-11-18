import { PageTitle } from "@/app/components/PageTitle";
import { MANAGE_PLAYGROUND_TEMPLATES_PATH } from "@/app/constants/playground";
import { PlaygroundTemplateForm } from "../PlaygroundTemplateForm";

export default function NewPlaygroundTemplatePage() {
  return (
    <div className="max-w-6xl mx-auto">
      <PageTitle
        title="ひな形の作成"
        breadcrumbs={[
          { label: "コードを試す ひな形", href: MANAGE_PLAYGROUND_TEMPLATES_PATH },
          { label: "新規作成" },
        ]}
      />
      <PlaygroundTemplateForm mode="create" />
    </div>
  );
}
