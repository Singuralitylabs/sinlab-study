import { COMMUNITY_APPLY_FORM_URL } from "@/app/constants/stripe";
import { Button } from "@/components/ui/button";

/** Opens the community membership application form in a new tab (#408). */
export function CommunityApplyButton() {
  return (
    <Button asChild size="lg" className="w-full">
      <a href={COMMUNITY_APPLY_FORM_URL} target="_blank" rel="noopener noreferrer">
        申し込む
      </a>
    </Button>
  );
}
