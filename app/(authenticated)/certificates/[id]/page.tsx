import { Share2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { CERTIFICATE_ISSUER_NAME, CERTIFICATE_SERVICE_NAME } from "@/app/constants/certificate";
import { buildCertificateShareUrl } from "@/app/lib/certificate";
import { formatDate } from "@/app/lib/format-date";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { fetchMyCertificateById } from "@/app/services/api/certificates-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Button } from "@/components/ui/button";
import { PrintButton } from "./PrintButton";

// The sheet is a fixed light design (explicit colors, not theme tokens) so it reads the same on
// screen in dark mode and on paper. Sizes use container units (cqw) of the sheet width, so the
// layout scales identically on screen and at A4 landscape width (297mm) when printed.
const PRINT_STYLE = `
@page { size: A4 landscape; margin: 0; }
@media print {
  html, body { background: #ffffff !important; }
  .certificate-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const certificateId = parsePositiveInteger((await params).id);
  if (certificateId === null) {
    notFound();
  }

  const { userId } = await getServerAuth();
  if (userId === null) {
    notFound();
  }

  const { data: certificate } = await fetchMyCertificateById(userId, certificateId);
  // Someone else's certificate and a missing one are both 404; the page is owner-only.
  if (!certificate) {
    notFound();
  }

  const shareUrl = buildCertificateShareUrl(
    certificate.theme_name,
    process.env.NEXT_PUBLIC_APP_URL || null
  );

  return (
    <div className="max-w-5xl mx-auto print:mx-0 print:max-w-none">
      <style>{PRINT_STYLE}</style>

      <div className="print:hidden">
        <PageTitle
          title="修了証"
          breadcrumbs={[
            { label: "修了証", href: "/certificates" },
            { label: certificate.theme_name },
          ]}
        />
        <div className="mb-4 flex flex-wrap gap-2">
          <PrintButton />
          <Button asChild variant="outline">
            <a href={shareUrl} target="_blank" rel="noopener noreferrer">
              <Share2 className="h-4 w-4" />X で共有
            </a>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <div className="@container certificate-sheet relative mx-auto aspect-[297/210] min-w-[640px] w-full overflow-hidden bg-white text-neutral-900 shadow-md print:h-[209mm] print:w-[297mm] print:min-w-0 print:max-w-none print:shadow-none">
          <div className="absolute inset-[2.4cqw] border-[0.5cqw] border-indigo-900" />
          <div className="absolute inset-[3.6cqw] border-[0.15cqw] border-indigo-400" />

          <div className="relative flex h-full flex-col items-center justify-between px-[8cqw] py-[7cqw] text-center">
            <div>
              <p className="text-[1.6cqw] tracking-[0.4em] text-indigo-700">
                CERTIFICATE OF COMPLETION
              </p>
              <h2 className="mt-[1cqw] text-[6cqw] font-bold tracking-[0.5em] text-indigo-950">
                修了証
              </h2>
            </div>

            <div className="w-full">
              <p className="mx-auto w-[60%] border-b-[0.2cqw] border-neutral-400 pb-[0.6cqw] text-[4cqw] font-semibold break-words">
                {certificate.recipient_name}
                <span className="ml-[1.2cqw] text-[2cqw] font-normal">殿</span>
              </p>
              <p className="mt-[3cqw] text-[2.2cqw] leading-[1.9]">
                あなたは「<span className="font-bold">{certificate.theme_name}</span>
                」の全課程を修了したことを証します。
              </p>
            </div>

            <div className="w-full">
              <p className="text-[1.8cqw]">{formatDate(certificate.issued_at)}</p>
              <p className="mt-[0.8cqw] text-[1.5cqw] text-neutral-600">
                証明番号 {certificate.certificate_no}
              </p>
              <p className="mt-[1.6cqw] text-[2.2cqw] font-bold text-indigo-950">
                {CERTIFICATE_SERVICE_NAME}
              </p>
              <p className="text-[1.6cqw]">{CERTIFICATE_ISSUER_NAME}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
