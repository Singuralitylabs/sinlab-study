import { Share2 } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { CERTIFICATE_SERVICE_NAME, getCertificateIssuerName } from "@/app/constants/certificate";
import { CERTIFICATE_MASCOT } from "@/app/constants/mascot";
import {
  buildCertificateFacebookShareUrl,
  buildCertificateLineShareUrl,
  buildCertificateShareUrl,
} from "@/app/lib/certificate";
import { formatDate } from "@/app/lib/format-date";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import { fetchMyCertificateById } from "@/app/services/api/certificates-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Button } from "@/components/ui/button";
import { PrintButton } from "./PrintButton";

// The sheet is a fixed light design (explicit colors, not theme tokens) so it reads the same on
// screen in dark mode and on paper. Sizes use container units (cqw) of the sheet width, so the
// layout scales identically on screen and at A4 landscape width (297mm) when printed. The mascot
// sits in the bottom-right corner; a very long theme name wraps to two lines and nears it.
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

  const issuerName = getCertificateIssuerName();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || null;
  const shareUrl = buildCertificateShareUrl(certificate.theme_name, appUrl);
  const lineShareUrl = buildCertificateLineShareUrl(certificate.theme_name, appUrl);
  const facebookShareUrl = buildCertificateFacebookShareUrl(appUrl);

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
          {lineShareUrl && (
            <Button asChild variant="outline">
              <a href={lineShareUrl} target="_blank" rel="noopener noreferrer">
                <Share2 className="h-4 w-4" />
                LINE で共有
              </a>
            </Button>
          )}
          {facebookShareUrl && (
            <Button asChild variant="outline">
              <a href={facebookShareUrl} target="_blank" rel="noopener noreferrer">
                <Share2 className="h-4 w-4" />
                Facebook で共有
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <div className="@container certificate-sheet relative mx-auto aspect-[297/210] min-w-[640px] w-full overflow-hidden bg-gradient-to-br from-white via-indigo-50 to-emerald-50 text-neutral-900 shadow-md print:h-[209mm] print:w-[297mm] print:min-w-0 print:max-w-none print:shadow-none">
          <div className="absolute inset-[2.4cqw] border-[0.5cqw] border-indigo-900" />
          <div className="absolute inset-[3.6cqw] border-[0.15cqw] border-indigo-400" />

          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <span className="absolute left-[7cqw] top-[7cqw] h-[1.4cqw] w-[1.4cqw] rotate-12 rounded-[0.2cqw] bg-pink-300" />
            <span className="absolute left-[11cqw] top-[12cqw] h-[1cqw] w-[1cqw] rounded-full bg-amber-300" />
            <span className="absolute left-[6cqw] top-[18cqw] h-[1.2cqw] w-[1.2cqw] -rotate-12 rounded-[0.2cqw] bg-sky-300" />
            <span className="absolute right-[7cqw] top-[7cqw] h-[1.4cqw] w-[1.4cqw] -rotate-12 rounded-[0.2cqw] bg-sky-300" />
            <span className="absolute right-[12cqw] top-[11cqw] h-[1cqw] w-[1cqw] rounded-full bg-pink-300" />
            <span className="absolute right-[6cqw] top-[17cqw] h-[1.2cqw] w-[1.2cqw] rotate-12 rounded-[0.2cqw] bg-amber-300" />
            <span className="absolute bottom-[7cqw] left-[7cqw] h-[1.2cqw] w-[1.2cqw] rotate-12 rounded-[0.2cqw] bg-amber-300" />
            <span className="absolute bottom-[12cqw] left-[10cqw] h-[1cqw] w-[1cqw] rounded-full bg-sky-300" />
            <span className="absolute bottom-[6.5cqw] left-[14cqw] h-[1.4cqw] w-[1.4cqw] -rotate-12 rounded-[0.2cqw] bg-pink-300" />
          </div>

          <Image
            src={CERTIFICATE_MASCOT.src}
            alt={CERTIFICATE_MASCOT.alt}
            width={480}
            height={480}
            sizes="22vw"
            className="pointer-events-none absolute bottom-[4.5cqw] right-[5.5cqw] h-[21cqw] w-[21cqw]"
          />

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
              {issuerName && <p className="text-[1.6cqw]">{issuerName}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
