import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * admin / maintainer が未公開の階層・コンテンツをプレビュー中であることを示すバッジ（issue #68）。
 */
export function UnpublishedBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 shrink-0 text-xs border-amber-500/50 text-amber-600 dark:text-amber-400"
    >
      <EyeOff className="h-3 w-3" />
      未公開
    </Badge>
  );
}
