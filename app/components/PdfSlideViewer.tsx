"use client";

import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfSlideViewerProps {
  url: string;
}

export function PdfSlideViewer({ url }: PdfSlideViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  }, []);

  const goToPrevPage = useCallback(() => setPageNumber((prev) => Math.max(prev - 1, 1)), []);
  const goToNextPage = useCallback(
    () => setPageNumber((prev) => Math.min(prev + 1, numPages)),
    [numPages]
  );
  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 2.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.4));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrevPage();
      if (e.key === "ArrowRight") goToNextPage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrevPage, goToNextPage]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* ツールバー */}
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={goToPrevPage}
          disabled={pageNumber <= 1}
          title="前のスライド"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="min-w-[80px] text-center text-sm tabular-nums">
          {pageNumber} / {numPages || "..."}
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={goToNextPage}
          disabled={pageNumber >= numPages}
          title="次のスライド"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="mx-2 h-4 w-px bg-border" />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={zoomOut}
          disabled={scale <= 0.4}
          title="縮小"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="min-w-[48px] text-center text-xs tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={zoomIn}
          disabled={scale >= 2.0}
          title="拡大"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* PDF表示エリア */}
      <div className="relative w-full overflow-auto rounded-lg border bg-muted/30">
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(error) => console.error("PDF読み込みエラー:", error)}
          loading={null}
          className="flex justify-center py-4"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            className="shadow-lg"
            renderAnnotationLayer={true}
            renderTextLayer={true}
          />
        </Document>
      </div>

      {/* キーボードショートカットのヒント */}
      <p className="text-xs text-muted-foreground">← → キーでスライドを切り替えられます</p>
    </div>
  );
}
