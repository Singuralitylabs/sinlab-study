import { PageTitle } from "@/app/components/PageTitle";
import { ThemeForm } from "../ThemeForm";

export default function NewThemePage() {
  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="テーマ新規作成"
        breadcrumbs={[{ label: "テーマ管理", href: "/manage/themes" }, { label: "新規作成" }]}
      />
      <ThemeForm mode="create" />
    </div>
  );
}
