import { BookOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import {
  fetchDemoContentsByPhaseId,
  fetchDemoContext,
  fetchDemoPhaseById,
  fetchDemoThemeById,
} from "@/app/services/api/demo-learning-server";
import { Card, CardContent } from "@/components/ui/card";
import { DemoContentList } from "../../components/DemoContentList";
import { DemoProgressBar } from "../../components/DemoProgressBar";

interface PageProps {
  params: Promise<{ themeId: string; phaseId: string }>;
}

export default async function DemoPhasePage({ params }: PageProps) {
  const { themeId, phaseId } = await params;
  const themeIdNum = Number.parseInt(themeId, 10);
  const phaseIdNum = Number.parseInt(phaseId, 10);

  if (Number.isNaN(themeIdNum) || Number.isNaN(phaseIdNum)) notFound();

  const [{ data: theme }, { data: phase }, { data: contents }, { data: ctx }] = await Promise.all([
    fetchDemoThemeById(themeIdNum),
    fetchDemoPhaseById(phaseIdNum),
    fetchDemoContentsByPhaseId(phaseIdNum),
    fetchDemoContext(),
  ]);

  if (!theme || !phase || phase.theme_id !== themeIdNum) notFound();

  const isDemoPhase = ctx !== null && ctx.phase.id === phaseIdNum;

  // Locked (non-trial) contents can't be completed, so counting them would stop progress below 100%.
  const demoContentIds = isDemoPhase
    ? (contents ?? []).filter((c) => c.is_open_to_trial).map((c) => c.id)
    : [];

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle
        title={phase.name}
        description={phase.description ?? undefined}
        breadcrumbs={[
          { label: "学習コンテンツ", href: "/demo" },
          { label: theme.name, href: `/demo/${themeIdNum}` },
          { label: phase.name },
        ]}
      />

      <DemoProgressBar contentIds={demoContentIds} />

      {!contents || contents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              このフェーズにはまだコンテンツが登録されていません。
            </p>
          </CardContent>
        </Card>
      ) : (
        <DemoContentList
          contents={contents}
          themeId={themeIdNum}
          phaseId={phaseIdNum}
          locked={!isDemoPhase}
        />
      )}
    </div>
  );
}
