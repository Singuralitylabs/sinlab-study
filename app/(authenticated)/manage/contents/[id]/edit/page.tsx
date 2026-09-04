import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { deriveWeekSelectOptions } from "@/app/lib/content-filtering";
import { sortWeeksByHierarchy } from "@/app/lib/content-grouping";
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

  const sortedWeeks = weeks ? sortWeeksByHierarchy(weeks) : [];
  const filterOptions = deriveWeekSelectOptions(sortedWeeks);

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="コンテンツ編集"
        breadcrumbs={[
          { label: "コンテンツ管理", href: "/manage/contents" },
          { label: content.title },
        ]}
      />
      <ContentForm
        themes={filterOptions.themes}
        phases={filterOptions.phases}
        weeks={filterOptions.weeks}
        initialData={content}
        mode="edit"
      />
    </div>
  );
}
