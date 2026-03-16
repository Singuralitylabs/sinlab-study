import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchThemeById } from "@/app/services/api/admin-server";
import { ThemeForm } from "../../ThemeForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditThemePage({ params }: PageProps) {
  const { id } = await params;
  const themeId = Number.parseInt(id, 10);

  if (Number.isNaN(themeId)) {
    notFound();
  }

  const { data: theme } = await fetchThemeById(themeId);

  if (!theme) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageTitle
        title="テーマ編集"
        breadcrumbs={[{ label: "テーマ管理", href: "/manage/themes" }, { label: theme.name }]}
      />
      <ThemeForm initialData={theme} mode="edit" />
    </div>
  );
}
