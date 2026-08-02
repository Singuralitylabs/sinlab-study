import { PageTitle } from "@/app/components/PageTitle";
import { UploadForm } from "./UploadForm";

export default function ImportContentsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="CSV一括取り込み"
        breadcrumbs={[
          { label: "コンテンツ管理", href: "/manage/contents" },
          { label: "CSV一括取り込み" },
        ]}
      />
      <UploadForm />
    </div>
  );
}
