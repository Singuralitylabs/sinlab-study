import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCronRequest } from "@/app/services/auth/cron-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAuthorizedCronRequest", () => {
  it("CRON_SECRET が未設定なら、どんなヘッダーでも拒否する（フェイルクローズ）", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedCronRequest("Bearer ")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer undefined")).toBe(false);
    expect(isAuthorizedCronRequest(null)).toBe(false);
  });

  it("Authorization ヘッダーが無い・不一致なら拒否する", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isAuthorizedCronRequest(null)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer wrong")).toBe(false);
    expect(isAuthorizedCronRequest("s3cret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer s3cret ")).toBe(false);
  });

  it("Bearer <CRON_SECRET> と一致すれば許可する", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isAuthorizedCronRequest("Bearer s3cret")).toBe(true);
  });
});
