import { Share2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { getCertificateIssuerName } from "@/app/constants/certificate";
import {
  buildCertificateFacebookShareUrl,
  buildCertificateLineShareUrl,
  buildCertificateShareUrl,
} from "@/app/lib/certificate";
import { resolveCertificateColors } from "@/app/lib/certificate-palette";
import { formatDateLong } from "@/app/lib/format-date";
import { parsePositiveInteger } from "@/app/lib/positive-integer";
import {
  fetchCertificateThemeColor,
  fetchMyCertificateById,
} from "@/app/services/api/certificates-server";
import { getServerAuth } from "@/app/services/auth/server-auth";
import { Button } from "@/components/ui/button";
import { CertificateSheet } from "./CertificateSheet";
import { PrintButton } from "./PrintButton";

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

  const themeColor = await fetchCertificateThemeColor(certificate.theme_id);
  const colors = resolveCertificateColors(certificate.theme_id, themeColor);
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
        <CertificateSheet
          recipientName={certificate.recipient_name}
          themeName={certificate.theme_name}
          issuedDate={formatDateLong(certificate.issued_at)}
          certificateNo={certificate.certificate_no}
          issuerName={issuerName}
          colors={colors}
        />
      </div>
    </div>
  );
}
