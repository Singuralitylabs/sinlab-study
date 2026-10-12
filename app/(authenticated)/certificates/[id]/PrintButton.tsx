"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Just opens the browser print dialog (which can also save as PDF); no PDF library is used. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      印刷 / PDF で保存
    </Button>
  );
}
