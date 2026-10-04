import { Award } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { isCertificateEligible } from "@/app/lib/certificate";
import { formatDate } from "@/app/lib/format-date";
import { fetchMyCertificates } from "@/app/services/api/certificates-server";
import { fetchThemeProgressSummaries } from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default async function CertificatesPage() {
  const { userId, userStatus, userRole } = await getServerAuth();

  // Certificates exist only for active members; trial users and admin / maintainer have none.
  if (userId === null || !isCertificateEligible(userStatus, userRole)) {
    redirect("/");
  }

  const [{ data: certificates }, { data: summaries }] = await Promise.all([
    fetchMyCertificates(userId),
    fetchThemeProgressSummaries(userId),
  ]);

  const issuedThemeIds = new Set((certificates ?? []).map((c) => c.theme_id));
  const pendingThemes = (summaries ?? []).filter(
    (s) => s.totalContents > 0 && !issuedThemeIds.has(s.theme.id)
  );

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle title="修了証" description="テーマをすべて完了すると修了証が発行されます" />

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          発行済みの修了証
        </h2>
        {!certificates || certificates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              まだ修了証はありません。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {certificates.map((certificate) => (
              <Link key={certificate.id} href={`/certificates/${certificate.id}`} className="block">
                <Card className="transition-all hover:shadow-md hover:border-primary/20">
                  <CardContent className="pt-4 pb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{certificate.theme_name}</p>
                      <p className="text-sm text-muted-foreground">
                        証明番号 {certificate.certificate_no}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {formatDate(certificate.issued_at)} 発行
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {pendingThemes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">未発行のテーマ</h2>
          <div className="grid gap-3">
            {pendingThemes.map(({ theme, totalContents, completedContents }) => {
              const progress = Math.round((completedContents / totalContents) * 100);
              return (
                <Card key={theme.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Link href={`/learn/${theme.id}`} className="font-medium hover:underline">
                        {theme.name}
                      </Link>
                      <span className="text-sm text-muted-foreground shrink-0">{progress}%</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      修了すると発行されます（{completedContents} / {totalContents}）
                    </p>
                    <Progress value={progress} className="h-2" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
