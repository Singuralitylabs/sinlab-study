import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllWeeks } from "@/app/services/api/admin-server";
import { ContentForm } from "../ContentForm";

export default async function NewContentPage() {
  const { data: weeks } = await fetchAllWeeks();

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="コンテンツ新規作成"
        breadcrumbs={[
          { label: "コンテンツ管理", href: "/manage/contents" },
          { label: "新規作成" },
        ]}
      />
      <ContentForm weeks={weeks ?? []} mode="create" />
    </div>
  );
}
