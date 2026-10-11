import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import {
  EMAIL_TEMPLATE_BODY_MAX,
  EMAIL_TEMPLATE_SUBJECT_MAX,
  EMAIL_TEST_SEND_DAILY_LIMIT,
} from "@/app/constants/notifications";
import { EMAIL_TEMPLATE_DEFINITIONS, isEmailTemplateKey } from "@/app/lib/email-template";
import { fetchEmailTemplatesForAdmin } from "@/app/services/api/email-templates-server";
import { getPreviewVariants } from "@/app/services/notifications/email-template-preview";
import { TemplateEditor } from "../components/template-editor";

type PageProps = { params: Promise<{ templateKey: string }> };

export default async function AdminEmailTemplateEditPage({ params }: PageProps) {
  const { templateKey: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  if (!isEmailTemplateKey(key)) {
    notFound();
  }
  const definition = EMAIL_TEMPLATE_DEFINITIONS[key];
  const { data, error } = await fetchEmailTemplatesForAdmin();
  const stored = data?.templates.find((t) => t.key === key)?.stored ?? null;

  return (
    <div className="space-y-6">
      <PageTitle
        title={`${definition.label}のメール文面`}
        breadcrumbs={[
          { label: "メール通知", href: "/admin/emails" },
          { label: "メール文面の編集", href: "/admin/emails/templates" },
          { label: definition.label },
        ]}
      />
      {error || !data ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <TemplateEditor
          templateKey={key}
          isEdited={stored !== null}
          initialSubject={stored?.subject ?? definition.subject}
          initialBody={stored?.body ?? definition.body}
          defaultSubject={definition.subject}
          defaultBody={definition.body}
          placeholders={Object.entries(definition.placeholders).map(([name, description]) => ({
            name,
            description,
          }))}
          variants={getPreviewVariants(key)}
          subjectMax={EMAIL_TEMPLATE_SUBJECT_MAX}
          bodyMax={EMAIL_TEMPLATE_BODY_MAX}
          testSendLimit={EMAIL_TEST_SEND_DAILY_LIMIT}
          serviceName={data.branding.serviceName}
        />
      )}
    </div>
  );
}
