import { PageTitle } from "@/app/components/PageTitle";
import { AnnouncementForm } from "../AnnouncementForm";

export default function NewAnnouncementPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="お知らせの作成"
        breadcrumbs={[
          { label: "お知らせ管理", href: "/manage/announcements" },
          { label: "新規作成" },
        ]}
      />
      <AnnouncementForm mode="create" />
    </div>
  );
}
