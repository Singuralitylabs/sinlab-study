import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STREAM_DEMO_TOKEN_EXPIRES_IN_SECONDS,
  STREAM_TOKEN_EXPIRES_IN_SECONDS,
} from "@/app/constants/stream";
import {
  createStreamPlaybackForDemo,
  createStreamPlaybackForMember,
  signStreamToken,
} from "@/app/services/api/stream-server";

const UID = "0123456789abcdef0123456789abcdef";
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

function tokenFromUrl(url: string): string {
  return new URL(url).pathname.split("/")[1];
}

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_STREAM_CUSTOMER_CODE", "abc123");
  vi.stubEnv("CLOUDFLARE_STREAM_SIGNING_KEY_ID", "key-id-1");
  vi.stubEnv("CLOUDFLARE_STREAM_SIGNING_KEY_PEM", Buffer.from(privateKey).toString("base64"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("signStreamToken", () => {
  it("RS256 で署名し、検証鍵で検証できる", () => {
    const token = signStreamToken(UID, { signingKeyId: "k", signingKeyPem: privateKey }, 100, 1000);
    const [h, p, sig] = token.split(".");
    expect(decode(h)).toEqual({ alg: "RS256", kid: "k" });
    expect(decode(p)).toMatchObject({ sub: UID, kid: "k", exp: 1100 });
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${p}`)
      .verify(publicKey, Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
  });
});

describe("createStreamPlaybackForMember", () => {
  it("トークン入りの iframe / サムネイル URL を返す（期限は会員用定数）", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = createStreamPlaybackForMember(UID);
    expect(result?.iframeSrc).toMatch(
      /^https:\/\/customer-abc123\.cloudflarestream\.com\/[^/]+\/iframe\?/
    );
    expect(result?.thumbnailSrc).toContain("/thumbnails/thumbnail.jpg");
    const payload = decode(tokenFromUrl(result?.iframeSrc ?? "").split(".")[1]);
    expect(payload.sub).toBe(UID);
    expect(payload.exp - now).toBeGreaterThanOrEqual(STREAM_TOKEN_EXPIRES_IN_SECONDS - 5);
    expect(payload.exp - now).toBeLessThanOrEqual(STREAM_TOKEN_EXPIRES_IN_SECONDS + 5);
  });

  it("Base64 でない生の PEM も受け付ける", () => {
    vi.stubEnv("CLOUDFLARE_STREAM_SIGNING_KEY_PEM", privateKey);
    expect(createStreamPlaybackForMember(UID)).not.toBeNull();
  });

  it.each([
    "CLOUDFLARE_STREAM_CUSTOMER_CODE",
    "CLOUDFLARE_STREAM_SIGNING_KEY_ID",
    "CLOUDFLARE_STREAM_SIGNING_KEY_PEM",
  ])("%s が未設定なら null（フェイルクローズ）", (name) => {
    vi.stubEnv(name, "");
    expect(createStreamPlaybackForMember(UID)).toBeNull();
  });

  it("鍵がPEMでなければ null、動画IDが不正でも null", () => {
    vi.stubEnv("CLOUDFLARE_STREAM_SIGNING_KEY_PEM", Buffer.from("garbage").toString("base64"));
    expect(createStreamPlaybackForMember(UID)).toBeNull();
    vi.stubEnv("CLOUDFLARE_STREAM_SIGNING_KEY_PEM", Buffer.from(privateKey).toString("base64"));
    expect(createStreamPlaybackForMember("https://www.youtube.com/watch?v=x")).toBeNull();
  });

  it("エラーログに鍵やトークンを含めない", () => {
    vi.stubEnv(
      "CLOUDFLARE_STREAM_SIGNING_KEY_PEM",
      Buffer.from("-----BEGIN X-----").toString("base64")
    );
    createStreamPlaybackForMember(UID);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("BEGIN");
  });
});

describe("createStreamPlaybackForDemo", () => {
  const base = {
    content_type: "video" as const,
    video_url: UID,
    is_published: true,
    is_deleted: false,
    is_open_to_trial: true,
  };

  it("お試し公開の動画だけに、短い期限のトークンを発行する", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = createStreamPlaybackForDemo(base);
    const payload = decode(tokenFromUrl(result?.iframeSrc ?? "").split(".")[1]);
    expect(payload.exp - now).toBeLessThanOrEqual(STREAM_DEMO_TOKEN_EXPIRES_IN_SECONDS + 5);
  });

  it.each([
    { is_open_to_trial: false },
    { is_published: false },
    { is_deleted: true },
    { content_type: "text" as const },
    { video_url: null },
  ])("%o では発行しない", (override) => {
    expect(createStreamPlaybackForDemo({ ...base, ...override })).toBeNull();
  });
});
