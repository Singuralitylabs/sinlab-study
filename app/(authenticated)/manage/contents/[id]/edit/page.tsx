import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllWeeks, fetchContentByIdForAdmin } from "@/app/services/api/admin-server";
import { ContentForm } from "../../ContentForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditContentPage({ params }: PageProps) {
  const { id } = await params;
  const contentId = Number.parseInt(id, 10);

  if (Number.isNaN(contentId)) {
    notFound();
  }

  const [{ data: content }, { data: weeks }] = await Promise.all([
    fetchContentByIdForAdmin(contentId),
    fetchAllWeeks(),
  ]);

  if (!content) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="コンテンツ編集"
        breadcrumbs={[
          { label: "コンテンツ管理", href: "/manage/contents" },
          { label: content.title },
        ]}
      />
      <ContentForm weeks={weeks ?? []} initialData={content} mode="edit" />
    </div>
  );
}
