export type PushOffer = "hidden" | "ios-guide" | "subscribe";

export type PushStatus = "loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

/**
 * The home page only nudges users who can still act on it. Subscribed, denied and unsupported
 * users manage push from /settings, and "loading" stays hidden so the card does not flash in
 * before the browser subscription is known.
 */
export function showPushOnHome(offer: PushOffer | null, status: PushStatus): boolean {
  if (offer === "ios-guide") {
    return true;
  }
  return offer === "subscribe" && status === "unsubscribed";
}

/**
 * The subscribe control is hidden until VAPID is fully configured. iOS Safari can subscribe
 * only from a home-screen PWA, so a browser tab gets the install hint and no permission button.
 */
export function pushOffer(input: {
  configured: boolean;
  isIos: boolean;
  standalone: boolean;
}): PushOffer {
  if (!input.configured) {
    return "hidden";
  }
  if (input.isIos && !input.standalone) {
    return "ios-guide";
  }
  return "subscribe";
}
