import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * admin / maintainer が未公開の階層・コンテンツをプレビュー中であることを示すバッジ（issue #68）。
 * `/manage` 配下の非公開バッジ（例: `manage/themes/page.tsx`）と文言・見た目を揃えている。
 */
export function UnpublishedBadge() {
  return (
    <Badge variant="secondary" className="gap-1 shrink-0 text-xs">
      <EyeOff className="h-3 w-3" />
      非公開
    </Badge>
  );
}
