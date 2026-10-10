import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { deriveWeekSelectOptions } from "@/app/lib/content-filtering";
import { compareGroupLevel, sortWeeksByHierarchy } from "@/app/lib/content-grouping";
import {
  fetchAllWeeks,
  fetchContentByIdForAdmin,
  fetchContentSiblingCandidates,
  fetchQuizQuestionsForAdmin,
} from "@/app/services/api/admin-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  const [
    { data: content },
    { data: weeks },
    { data: contents, error: contentsError },
    { data: quizQuestions, error: quizError },
  ] = await Promise.all([
    fetchContentByIdForAdmin(contentId),
    fetchAllWeeks(),
    fetchContentSiblingCandidates(),
    fetchQuizQuestionsForAdmin(contentId),
  ]);

  if (!content) {
    notFound();
  }

  const sortedWeeks = weeks ? sortWeeksByHierarchy(weeks) : [];
  const filterOptions = deriveWeekSelectOptions(sortedWeeks);

  // Treating a failed sibling fetch (all contents, including itself) as "no siblings" would leave
  // the current position unknown and default the insert picker to the head. If the DB recovers by
  // PUT time (renumbering inside updateContent), all existing contents would be renumbered backward
  // unintentionally, so don't show the form on failure (same policy as new/page.tsx).
  // A failed question fetch would open the editor empty, and saving would wipe the stored
  // questions (the save replaces them all), so don't show the form.
  if (contentsError || !contents || quizError || !quizQuestions) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageTitle
          title="コンテンツ編集"
          breadcrumbs={[
            { label: "コンテンツ管理", href: "/manage/contents" },
            { label: content.title },
          ]}
        />
        <Alert variant="destructive">
          <AlertDescription>
            {quizError
              ? "クイズの設問の取得に失敗しました。時間をおいて再度お試しください。"
              : "既存コンテンツの一覧取得に失敗しました。時間をおいて再度お試しください。"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Sort with the same comparator as content-grouping.ts (display_order ascending, id tiebreak).
  const siblingCandidates = [...contents]
    .sort((a, b) => compareGroupLevel(a.display_order, b.display_order, a.id, b.id))
    .map((c) => ({
      id: c.id,
      label: c.title,
      isPublished: c.is_published,
      parentId: c.week_id,
    }));

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
        initialQuizQuestions={quizQuestions}
        siblingCandidates={siblingCandidates}
        mode="edit"
      />
    </div>
  );
}
