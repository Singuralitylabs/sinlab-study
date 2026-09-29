import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Badge shown while admin/maintainer preview unpublished hierarchy/content (#68); matches the
 * wording and look of the /manage unpublished badge. Renders nothing when isPublished is true, so
 * callers needn't write `!x.is_published && <UnpublishedBadge />`.
 */
export function UnpublishedBadge({ isPublished }: { isPublished: boolean }) {
  if (isPublished) {
    return null;
  }

  return (
    <Badge variant="secondary" className="gap-1 shrink-0 text-xs">
      <EyeOff className="h-3 w-3" />
      非公開
    </Badge>
  );
}
