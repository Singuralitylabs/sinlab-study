import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/services/notifications/email-digest-server");

import { GET, maxDuration } from "@/app/api/cron/email-digest/route";
import { runEmailDigest } from "@/app/services/notifications/email-digest-server";

function request(authorization?: string) {
  return new NextRequest("https://study.example.com/api/cron/email-digest", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runEmailDigest).mockResolvedValue({
    status: "completed",
    date: "2026-10-05",
    queued: 1,
    sent: 1,
    failed: 0,
    duplicate: 0,
    skipped: 0,
    deferred: 0,
    weeklyReservationMissing: false,
    announcementsCompleted: 0,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/email-digest", () => {
  it("maxDuration を明示している", () => {
    expect(maxDuration).toBe(60);
  });

  it("CRON_SECRET が未設定なら 401 を返し、送信処理を呼ばない", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await GET(request("Bearer "));

    expect(res.status).toBe(401);
    expect(runEmailDigest).not.toHaveBeenCalled();
  });

  it("Authorization が無い・不一致なら 401 を返し、送信処理を呼ばない", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");

    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect(runEmailDigest).not.toHaveBeenCalled();
  });

  it("Bearer <CRON_SECRET> なら送信処理を実行し、結果を返す", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");

    const res = await GET(request("Bearer s3cret"));

    expect(res.status).toBe(200);
    expect(runEmailDigest).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ status: "completed", sent: 1 });
  });

  it("送信対象の抽出に失敗したら 500 を返す", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.mocked(runEmailDigest).mockResolvedValue({ status: "failed" });

    const res = await GET(request("Bearer s3cret"));

    expect(res.status).toBe(500);
  });
});
