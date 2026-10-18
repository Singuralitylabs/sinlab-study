const TRIAL_BANNER_HIDDEN_EXACT_PATHS: readonly string[] = ["/upgrade"];

const LEARN_PATH_PREFIX = "/learn/";

/**
 * The trial banner only repeats what /upgrade and the learning screens (content list and detail) already
 * say with their own CTA, so it is hidden there by path alone (#353). /upgrade is matched exactly:
 * /upgrade/success must keep the banner for a user whose upgrade did not go through. The learning
 * screens are /learn/<themeId>/<phaseId> and deeper; /learn and /learn/<themeId> keep it.
 */
export function shouldHideTrialBanner(pathname: string): boolean {
  if (TRIAL_BANNER_HIDDEN_EXACT_PATHS.includes(pathname)) {
    return true;
  }
  if (!pathname.startsWith(LEARN_PATH_PREFIX)) {
    return false;
  }
  const segments = pathname.slice(LEARN_PATH_PREFIX.length).split("/").filter(Boolean);
  return segments.length >= 2;
}
