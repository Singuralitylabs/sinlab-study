import { BookOpen, CheckCircle, Clock, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { createServerSupabaseClient } from "@/app/services/api/supabase-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import type { LearningTheme } from "@/app/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ThemeWithProgress {
  theme: LearningTheme;
  totalContents: number;
  completedContents: number;
}

async function getThemeProgressSummary(userId: number): Promise<{
  themes: ThemeWithProgress[];
  totalContents: number;
  completedContents: number;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: themes, error: themesError } = await supabase
    .from("learning_themes")
    .select("*")
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("display_order");

  if (themesError || !themes) {
    return { themes: [], totalContents: 0, completedContents: 0 };
  }

  const themesWithProgress: ThemeWithProgress[] = await Promise.all(
    themes.map(async (theme) => {
      const { data: phases } = await supabase
        .from("learning_phases")
        .select("id")
        .eq("theme_id", theme.id)
        .eq("is_published", true)
        .eq("is_deleted", false);

      const phaseIds = phases?.map((p) => p.id) || [];

      if (phaseIds.length === 0) {
        return { theme, totalContents: 0, completedContents: 0 };
      }

      const { data: weeks } = await supabase
        .from("learning_weeks")
        .select("id")
        .in("phase_id", phaseIds)
        .eq("is_published", true)
        .eq("is_deleted", false);

      const weekIds = weeks?.map((w) => w.id) || [];

      if (weekIds.length === 0) {
        return { theme, totalContents: 0, completedContents: 0 };
      }

      const { count: totalContents } = await supabase
        .from("learning_contents")
        .select("id", { count: "exact", head: true })
        .in("week_id", weekIds)
        .eq("is_published", true)
        .eq("is_deleted", false);

      const { data: contentIds } = await supabase
        .from("learning_contents")
        .select("id")
        .in("week_id", weekIds)
        .eq("is_published", true)
        .eq("is_deleted", false);

      const ids = contentIds?.map((c) => c.id) || [];

      if (ids.length === 0) {
        return { theme, totalContents: totalContents || 0, completedContents: 0 };
      }

      const { count: completedContents } = await supabase
        .from("user_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_completed", true)
        .in("content_id", ids);

      return {
        theme,
        totalContents: totalContents || 0,
        completedContents: completedContents || 0,
      };
    })
  );

  const totalContents = themesWithProgress.reduce((sum, t) => sum + t.totalContents, 0);
  const completedContents = themesWithProgress.reduce((sum, t) => sum + t.completedContents, 0);

  return { themes: themesWithProgress, totalContents, completedContents };
}

export default async function HomePage() {
  const { userId } = await getServerAuth();

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">ユーザー情報を読み込み中...</p>
      </div>
    );
  }

  const { themes, totalContents, completedContents } = await getThemeProgressSummary(userId);
  const overallProgress =
    totalContents > 0 ? Math.round((completedContents / totalContents) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight mb-6">ダッシュボード</h1>

      {/* 全体進捗 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">学習進捗</h2>
              <p className="text-sm text-muted-foreground">
                {completedContents} / {totalContents} コンテンツ完了
              </p>
            </div>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <p className="text-right text-sm text-muted-foreground mt-2">{overallProgress}%</p>
        </CardContent>
      </Card>

      {/* テーマ一覧 */}
      <div className="grid gap-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          学習テーマ
        </h2>

        {themes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>学習コンテンツはまだ登録されていません。</p>
            </CardContent>
          </Card>
        ) : (
          themes.map(({ theme, totalContents, completedContents }) => {
            const progress =
              totalContents > 0 ? Math.round((completedContents / totalContents) * 100) : 0;
            const isCompleted = totalContents > 0 && completedContents === totalContents;

            return (
              <Link key={theme.id} href={`/learn/${theme.id}`} className="block group">
                <Card
                  className={`overflow-hidden transition-all hover:shadow-md hover:border-primary/20 ${isCompleted ? "border-l-4 border-l-success" : ""}`}
                >
                  <div className="flex">
                    {/* サムネイル */}
                    <div className="relative w-24 shrink-0 bg-linear-to-br from-primary/5 to-primary/15">
                      {theme.image_url ? (
                        <Image
                          src={theme.image_url}
                          alt={theme.name}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <BookOpen className="h-8 w-8 text-primary/30" />
                        </div>
                      )}
                    </div>

                    <CardContent className="pt-4 pb-4 flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4 text-success shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <h3 className="font-medium group-hover:text-primary transition-colors truncate">
                            {theme.name}
                          </h3>
                        </div>
                        <span className="text-sm text-muted-foreground shrink-0 ml-2">
                          {completedContents} / {totalContents}
                        </span>
                      </div>
                      {theme.description && (
                        <p className="text-sm text-muted-foreground mb-2 ml-6 line-clamp-1">
                          {theme.description}
                        </p>
                      )}
                      <div className="ml-6">
                        <Progress value={progress} className="h-2" />
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </Link>
            );
          })
        )}
      </div>

      {/* 学習を始めるボタン */}
      {themes.length > 0 && (
        <div className="mt-6 text-center">
          <Button asChild>
            <Link href="/learn">学習を始める</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
