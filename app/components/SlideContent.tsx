import { PdfSlideViewerNoSSR as PdfSlideViewer } from "@/app/components/PdfSlideViewerNoSSR";

interface SlideContentProps {
  signedUrl: string | null;
}

/**
 * Renders the slide PDF only when a signed URL could be issued. Failure can be a transient Storage
 * outage or a pdf_url that isn't interpretable as a key (a reload won't fix it), so the message
 * stays neutral about the cause. Each page.tsx issues the signed URL after the view-permission
 * check (#89).
 */
export function SlideContent({ signedUrl }: SlideContentProps) {
  if (!signedUrl) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        このスライドは現在表示できません。
      </p>
    );
  }

  return <PdfSlideViewer url={signedUrl} />;
}
