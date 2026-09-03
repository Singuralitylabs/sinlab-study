import { BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { UnpublishedBadge } from "@/app/components/UnpublishedBadge";
import { fetchPhasesByThemeId, fetchThemeById } from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ themeId: string }>;
}

export default async function ThemePage({ params }: PageProps) {
  const { themeId } = await params;
  const themeIdNum = Number.parseInt(themeId, 10);

  if (Number.isNaN(themeIdNum)) {
    notFound();
  }

  const { userRole } = await getServerAuth();

  const [{ data: theme }, { data: phases }] = await Promise.all([
    fetchThemeById(themeIdNum, userRole),
    fetchPhasesByThemeId(themeIdNum, userRole),
  ]);

  if (!theme) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle
        title={theme.name}
        description={theme.description || undefined}
        breadcrumbs={[{ label: "学習コンテンツ", href: "/learn" }, { label: theme.name }]}
        badge={!theme.is_published && <UnpublishedBadge />}
      />

      {!phases || phases.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              このテーマにはまだフェーズが登録されていません。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {phases.map((phase) => (
            <Link key={phase.id} href={`/learn/${themeIdNum}/${phase.id}`} className="block group">
              <Card className="transition-all hover:shadow-md hover:border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-full">
                        <BookOpen className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold group-hover:text-primary transition-colors">
                            {phase.name}
                          </h2>
                          {!phase.is_published && <UnpublishedBadge />}
                        </div>
                        {phase.description && (
                          <p className="text-sm text-muted-foreground mt-1">{phase.description}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
