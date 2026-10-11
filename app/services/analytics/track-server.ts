import { track } from "@vercel/analytics/server";
import {
  type AnalyticsEventName,
  type AnalyticsProperties,
  sanitizeAnalyticsProperties,
} from "@/app/constants/analytics";

/**
 * Fire-and-forget server event. A failure here must not change the caller's response
 * (signup, progress, submission, Checkout, webhook). Same policy as Slack / email.
 */
export function trackServerEvent(
  event: AnalyticsEventName,
  properties?: Record<string, string | number | boolean | null | undefined>
): void {
  const payload: AnalyticsProperties | undefined = sanitizeAnalyticsProperties(properties);
  try {
    const pending = payload ? track(event, payload) : track(event);
    void pending.catch((error: unknown) => {
      console.error("[analytics] イベント送信に失敗しました:", error);
    });
  } catch (error) {
    console.error("[analytics] イベント送信に失敗しました:", error);
  }
}
