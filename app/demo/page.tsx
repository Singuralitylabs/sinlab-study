import { BookOpen, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchDemoPublishedThemes } from "@/app/services/api/demo-learning-server";
import { Card } from "@/components/ui/card";

export default async function DemoRootPage() {
  const { data: themes } = await fetchDemoPublishedThemes();

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle title="学習コンテンツ" description="学習テーマを選択して学習を始めましょう" />

      {!themes || themes.length === 0 ? (
        <Card className="py-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">学習コンテンツはまだ登録されていません。</p>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {themes.map((theme) => (
            <Link key={theme.id} href={`/demo/${theme.id}`} className="block group">
              <Card className="overflow-hidden transition-all hover:shadow-lg hover:border-primary/30 h-full">
                <div className="relative aspect-video bg-linear-to-br from-primary/5 to-primary/15">
                  {theme.image_url ? (
                    <Image
                      src={theme.image_url}
                      alt={theme.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <BookOpen className="h-16 w-16 text-primary/30" />
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold group-hover:text-primary transition-colors">
                      {theme.name}
                    </h2>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </div>
                  {theme.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {theme.description}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
