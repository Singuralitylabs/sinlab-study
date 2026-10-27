import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

async function headerRules() {
  if (!nextConfig.headers) {
    throw new Error("next.config.ts has no headers()");
  }
  return nextConfig.headers();
}

describe("next.config headers", () => {
  it("sends the security headers on every path", async () => {
    const rules = await headerRules();
    const all = rules.find((rule) => rule.source === "/:path*");
    const byKey = Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));

    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Strict-Transport-Security"]).toMatch(/^max-age=\d+/);
    expect(byKey["Permissions-Policy"]).toContain("camera=()");
    expect(byKey["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  // The exercise preview is a srcdoc iframe that inherits this CSP; a script-src limit would stop
  // learners' inline scripts and the React preview's Babel.
  it("does not restrict scripts in the CSP", async () => {
    const rules = await headerRules();
    const csp = rules
      .flatMap((rule) => rule.headers)
      .find((h) => h.key === "Content-Security-Policy")?.value;

    expect(csp).toBeDefined();
    expect(csp).not.toMatch(/(?:^|;)\s*(?:default-src|script-src)/);
  });

  it("keeps the service worker headers", async () => {
    const rules = await headerRules();
    const sw = rules.find((rule) => rule.source === "/sw.js");

    expect(sw?.headers).toEqual(
      expect.arrayContaining([
        { key: "Cache-Control", value: "no-cache" },
        { key: "Service-Worker-Allowed", value: "/" },
      ])
    );
  });
});
