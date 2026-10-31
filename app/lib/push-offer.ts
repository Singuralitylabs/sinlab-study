export type PushOffer = "hidden" | "ios-guide" | "subscribe";

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
