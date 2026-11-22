"use client";

import { Check, Copy, Download, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The link is built from the current origin so preview and production each hand out their own
 * URL. The QR image is generated in the browser; nothing about the link is sent anywhere.
 */
export function TemplateShareButtons({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fullUrl = () => `${window.location.origin}${path}`;

  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(fullUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーできませんでした");
    }
  };

  const showQr = async () => {
    setError(null);
    const url = fullUrl();
    try {
      // Level M survives a slightly blurry projector photo; 1024px stays sharp on a slide.
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 1024,
      });
      setQr({ url, dataUrl });
    } catch {
      setError("QR コードを作れませんでした");
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button type="button" variant="ghost" size="icon-sm" title="リンクをコピー" onClick={copy}>
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" title="QR コード" onClick={showQr}>
        <QrCode className="h-4 w-4" />
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Dialog open={qr !== null} onOpenChange={(open) => !open && setQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="break-all">{qr?.url}</DialogDescription>
          </DialogHeader>
          {qr && (
            <div className="space-y-3">
              {/* biome-ignore lint/performance/noImgElement: a data URL generated on the spot; next/image adds nothing */}
              <img src={qr.dataUrl} alt={`${title} の QR コード`} className="mx-auto w-64" />
              <Button asChild variant="outline" className="w-full">
                <a href={qr.dataUrl} download="playground-qr.png">
                  <Download className="h-4 w-4" />
                  画像を保存（スライド用）
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
