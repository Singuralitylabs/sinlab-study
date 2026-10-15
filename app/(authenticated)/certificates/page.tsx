import { Award } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { isCertificateEligible, isThemeCompleted } from "@/app/lib/certificate";
import { formatDate } from "@/app/lib/format-date";
import {
  fetchMyCertificates,
  issueMissingCertificates,
} from "@/app/services/api/certificates-server";
import { fetchThemeProgressSummaries } from "@/app/services/api/learning-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

// Mail is sent in after() and the platform caps that at this route's maxDuration; the default
// (10s without Fluid Compute) would kill the function before EMAIL_SEND_TIMEOUT_MS (15s) aborts,
// leaving the email_logs claim row neither sent nor failed.
export const maxDuration = 30;

export default async function CertificatesPage() {
  const { userId, userStatus, userRole } = await getServerAuth();

  // Certificates exist only for active members; trial users and admin / maintainer have none.
  if (userId === null || !isCertificateEligible(userStatus, userRole)) {
    redirect("/");
  }

  const [{ data: initialCertificates }, { data: summaries, error: summariesError }] =
    await Promise.all([fetchMyCertificates(userId), fetchThemeProgressSummaries(userId)]);

  // Themes already 100% complete without a certificate (finished before release, or while trial)
  // never hit the progress trigger, so issue them here. Idempotent, so repeat visits are safe.
  // Skipped when the certificates could not be read: every theme would look unissued.
  const { issued: issuedNow, blockedByMissingName } = initialCertificates
    ? await issueMissingCertificates({
        userId,
        userStatus,
        userRole,
        summaries: summaries ?? [],
        issuedThemeIds: new Set(initialCertificates.map((c) => c.theme_id)),
      })
    : { issued: [], blockedByMissingName: false };
  // The list itself is whatever the last read returned: a failed re-read after issuing shows the
  // error card, never a stale (possibly empty) list.
  const { data: certificates } =
    issuedNow.length > 0 ? await fetchMyCertificates(userId) : { data: initialCertificates };

  // "Unissued" depends only on the first read plus what was just issued, so a failed re-read cannot
  // flip a just-issued theme (the row exists and the email goes out) to "could not be issued".
  const issuedThemeIds = new Set([
    ...(initialCertificates ?? []).map((c) => c.theme_id),
    ...issuedNow.map((c) => c.theme_id),
  ]);
  // Without the first read "unissued" cannot be computed (every theme would look unissued and no
  // backfill ran), so the section is omitted and only the list error is shown.
  const pendingThemes = initialCertificates
    ? (summaries ?? []).filter((s) => s.totalContents > 0 && !issuedThemeIds.has(s.theme.id))
    : [];

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle title="修了証" description="テーマをすべて完了すると修了証が発行されます" />

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          発行済みの修了証
        </h2>
        {!certificates ? (
          <Card>
            <CardContent className="py-8 text-center text-destructive">
              修了証の取得に失敗しました。時間をおいて再読み込みしてください。
            </CardContent>
          </Card>
        ) : certificates.length === 0 ? (
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

      {summariesError ? (
        <section>
          <h2 className="text-lg font-semibold mb-3">未発行のテーマ</h2>
          <Card>
            <CardContent className="py-8 text-center text-destructive">
              学習の進捗の取得に失敗しました。時間をおいて再読み込みしてください。
            </CardContent>
          </Card>
        </section>
      ) : (
        pendingThemes.length > 0 && (
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
                        {isThemeCompleted({ totalContents, completedContents }) ? (
                          // Completed but still unissued: a blank name or any other failure (logged
                          // server-side) left it. Never say "when you complete" for a done theme.
                          blockedByMissingName ? (
                            <>
                              氏名が未設定のため発行できません。
                              <Link
                                href="/settings"
                                className="text-primary underline underline-offset-2"
                              >
                                設定画面で名前を入力してください
                              </Link>
                            </>
                          ) : (
                            "修了証を発行できませんでした。時間をおいて再読み込みしてください。"
                          )
                        ) : (
                          `修了すると発行されます（${completedContents} / ${totalContents}）`
                        )}
                      </p>
                      <Progress value={progress} className="h-2" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )
      )}
    </div>
  );
}
