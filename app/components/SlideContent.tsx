import { PdfSlideViewerNoSSR as PdfSlideViewer } from "@/app/components/PdfSlideViewerNoSSR";

interface SlideContentProps {
  /** サーバー側で発行した署名付きURL。発行できなかった場合は null */
  signedUrl: string | null;
}

/**
 * スライドPDFの本体表示。署名付きURLを発行できたときだけビューアを描画する。
 * 発行できない原因は Storage の一時障害と、キーとして解釈できない pdf_url（再読み込みでは
 * 解決しない）の両方があり得るため、文言は原因を断定しない中立なものにする。
 * 署名付きURLの発行そのものは各 page.tsx が閲覧権限チェックの後に行う（issue #89）。
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
