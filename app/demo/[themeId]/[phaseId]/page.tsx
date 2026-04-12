import { Calendar } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import {
  fetchDemoContext,
  fetchDemoPhaseById,
  fetchDemoThemeById,
  fetchDemoWeeksWithContentsByPhaseId,
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

  const [{ data: theme }, { data: phase }, { data: weeks }, { data: ctx }] = await Promise.all([
    fetchDemoThemeById(themeIdNum),
    fetchDemoPhaseById(phaseIdNum),
    fetchDemoWeeksWithContentsByPhaseId(phaseIdNum),
    fetchDemoContext(),
  ]);

  if (!theme || !phase || phase.theme_id !== themeIdNum) notFound();

  // デモでアクセス可能なWeekのID（フェーズが一致する場合のみ）
  const demoWeekId = ctx && ctx.phase.id === phaseIdNum ? ctx.week.id : null;

  // プログレスバー用: デモWeekのコンテンツIDのみ
  const demoContentIds = weeks?.find((w) => w.id === demoWeekId)?.contents.map((c) => c.id) ?? [];

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

      {!weeks || weeks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">このフェーズにはまだ週が登録されていません。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {weeks.map((week) => {
            const isDemoWeek = week.id === demoWeekId;

            return (
              <div key={week.id}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-full bg-primary/10 text-primary">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-base font-semibold">{week.name}</h2>
                    {week.description && (
                      <p className="text-sm text-muted-foreground">{week.description}</p>
                    )}
                  </div>
                </div>

                {week.contents.length === 0 ? (
                  <p className="text-sm text-muted-foreground ml-12">
                    コンテンツはまだ登録されていません。
                  </p>
                ) : (
                  <DemoContentList
                    contents={week.contents}
                    themeId={themeIdNum}
                    phaseId={phaseIdNum}
                    weekId={week.id}
                    locked={!isDemoWeek}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
