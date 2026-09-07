import { PdfSlideViewerNoSSR as PdfSlideViewer } from "@/app/components/PdfSlideViewerNoSSR";

interface SlideContentProps {
  /** サーバー側で発行した署名付きURL。発行できなかった場合は null */
  signedUrl: string | null;
}

/**
 * スライドPDFの本体表示。署名付きURLを発行できたときだけビューアを描画し、
 * 発行できなかったとき（Storage障害・期限切れ等）は再読み込みを促す。
 * 署名付きURLの発行そのものは各 page.tsx が閲覧権限チェックの後に行う（issue #89）。
 */
export function SlideContent({ signedUrl }: SlideContentProps) {
  if (!signedUrl) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        スライドを読み込めませんでした。ページを再読み込みしてください。
      </p>
    );
  }

  return <PdfSlideViewer url={signedUrl} />;
}
