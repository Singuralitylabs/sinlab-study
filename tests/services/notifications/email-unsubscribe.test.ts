import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/app/services/notifications/email-unsubscribe";

beforeEach(() => {
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "unsubscribe-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("配信停止トークン", () => {
  it("生成したトークンを検証すると users.id を返す", () => {
    const token = createUnsubscribeToken(42);
    expect(token).toMatch(/^42\.[A-Za-z0-9_-]{43}$/);
    expect(verifyUnsubscribeToken(token)).toBe(42);
  });

  it("有効期限を持たない（時間が経っても同じトークンで検証できる）", () => {
    const token = createUnsubscribeToken(42);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2036-01-01T00:00:00Z"));
    expect(verifyUnsubscribeToken(token)).toBe(42);
  });

  it("ユーザーIDの差し替え・署名の改ざんを拒否する", () => {
    const token = createUnsubscribeToken(42) as string;
    const [, signature] = token.split(".");
    expect(verifyUnsubscribeToken(`43.${signature}`)).toBeNull();

    const last = signature.at(-1) === "A" ? "B" : "A";
    expect(verifyUnsubscribeToken(`42.${signature.slice(0, -1)}${last}`)).toBeNull();
  });

  it("別のシークレットで署名されたトークンを拒否する", () => {
    const token = createUnsubscribeToken(42);
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "rotated-secret");
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it.each([
    null,
    "",
    "42",
    "42.",
    "abc.def",
    "0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "-1.x",
  ])("形式不正（%s）を拒否する", (token) => {
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("シークレット未設定ならトークンを作らず、検証も必ず失敗する（フェイルクローズ）", () => {
    const token = createUnsubscribeToken(42);
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    expect(createUnsubscribeToken(42)).toBeNull();
    expect(buildUnsubscribeUrl("https://study.example.com", 42)).toBeNull();
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("配信停止リンクは NEXT_PUBLIC_APP_URL 起点の配信停止ルートを指す", () => {
    const url = buildUnsubscribeUrl("https://study.example.com/", 42) as string;
    expect(url.startsWith("https://study.example.com/api/email/unsubscribe?token=42.")).toBe(true);
    expect(verifyUnsubscribeToken(new URL(url).searchParams.get("token"))).toBe(42);
  });
});
