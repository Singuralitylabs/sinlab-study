import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import {
  PLAYGROUND_KIND_LABELS,
  PLAYGROUND_NAV_TITLE,
  PLAYGROUND_PATH,
} from "@/app/constants/playground";
import { fetchPlaygroundTemplateBySlug } from "@/app/services/api/playground-templates-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PlaygroundWorkspace } from "../../components/PlaygroundWorkspace";

export default async function PlaygroundTemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await getServerAuth();
  if (!userId) {
    notFound();
  }
  // RLS returns drafts only to admin / maintainer, so a learner gets 404 for them.
  const template = await fetchPlaygroundTemplateBySlug((await params).slug);
  if (!template) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto">
      <PageTitle
        title={template.title}
        breadcrumbs={[
          { label: PLAYGROUND_NAV_TITLE, href: PLAYGROUND_PATH },
          { label: template.title },
        ]}
        badge={<Badge variant="secondary">{PLAYGROUND_KIND_LABELS[template.kind]}</Badge>}
      />
      {!template.isPublished && (
        <Alert className="mb-4">
          <AlertDescription>
            このひな形は非公開です（管理者・メンテナーだけが開けます）。受講者に配る前に公開してください。
          </AlertDescription>
        </Alert>
      )}
      <PlaygroundWorkspace
        userId={userId}
        template={{ slug: template.slug, kind: template.kind, files: template.files }}
      />
      <p className="mt-4 text-sm text-muted-foreground">
        ほかの言語を試すときは
        <Link href={PLAYGROUND_PATH} className="underline hover:text-foreground">
          「{PLAYGROUND_NAV_TITLE}」のトップ
        </Link>
        から始められます。
      </p>
    </div>
  );
}
