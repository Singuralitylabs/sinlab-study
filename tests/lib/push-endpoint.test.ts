import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "@/app/lib/push-endpoint";

describe("isAllowedPushEndpoint", () => {
  it("既知の https プッシュホストだけを許す", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://android.googleapis.com/gcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(
      true
    );
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QABC")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=1")).toBe(true);
  });

  it("http・内部ホスト・長大な値は拒否する", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedPushEndpoint("https://evil.example/push")).toBe(false);
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${"a".repeat(5000)}`)).toBe(false);
    expect(isAllowedPushEndpoint("not-a-url")).toBe(false);
  });
});
