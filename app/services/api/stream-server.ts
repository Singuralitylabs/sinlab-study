import { createSign } from "node:crypto";
import {
  STREAM_DEMO_TOKEN_EXPIRES_IN_SECONDS,
  STREAM_THUMBNAIL_HEIGHT_PX,
  STREAM_TOKEN_EXPIRES_IN_SECONDS,
  STREAM_TOKEN_NOT_BEFORE_SKEW_SECONDS,
} from "@/app/constants/stream";
import { toStreamVideoUid } from "@/app/lib/video-source";
import type { LearningContent } from "@/app/types";

export interface StreamPlayback {
  iframeSrc: string;
  thumbnailSrc: string;
}

interface StreamConfig {
  customerCode: string;
  signingKeyId: string;
  signingKeyPem: string;
}

const CUSTOMER_CODE_PATTERN = /^[a-z0-9]+$/i;

/**
 * Fail closed: any missing or malformed setting disables Stream playback rather than minting a
 * token with a bad key. Values are never logged (spec 6.1.2).
 */
function readStreamConfig(): { config: StreamConfig } | { reason: string } {
  // Operators often paste the whole host (customer-<code>.cloudflarestream.com); accept it.
  const customerCode = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^customer-/i, "")
    .replace(/\.cloudflarestream\.com.*$/i, "");
  const signingKeyId = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID?.trim();
  const rawPem = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM?.trim();
  if (!customerCode || !CUSTOMER_CODE_PATTERN.test(customerCode)) {
    return { reason: "CLOUDFLARE_STREAM_CUSTOMER_CODE が未設定または不正" };
  }
  if (!signingKeyId) {
    return { reason: "CLOUDFLARE_STREAM_SIGNING_KEY_ID が未設定" };
  }
  if (!rawPem) {
    return { reason: "CLOUDFLARE_STREAM_SIGNING_KEY_PEM が未設定" };
  }

  // The Cloudflare API returns `result.pem` Base64-encoded; accept a raw PEM too for local setups.
  const signingKeyPem = rawPem.includes("-----BEGIN")
    ? rawPem.replace(/\\n/g, "\n")
    : Buffer.from(rawPem, "base64").toString("utf8");
  if (!signingKeyPem.includes("-----BEGIN")) {
    return { reason: "CLOUDFLARE_STREAM_SIGNING_KEY_PEM が PEM として解釈できない" };
  }

  return { config: { customerCode, signingKeyId, signingKeyPem } };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Self-signed RS256 JWT (no Cloudflare API call). Placed in the URL where the video UID would go.
 */
export function signStreamToken(
  uid: string,
  config: Pick<StreamConfig, "signingKeyId" | "signingKeyPem">,
  expiresInSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: config.signingKeyId }));
  const payload = base64Url(
    JSON.stringify({
      sub: uid,
      kid: config.signingKeyId,
      exp: nowSeconds + expiresInSeconds,
      nbf: nowSeconds - STREAM_TOKEN_NOT_BEFORE_SKEW_SECONDS,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(config.signingKeyPem);
  return `${signingInput}.${base64Url(signature)}`;
}

function createStreamPlayback(videoValue: string, expiresInSeconds: number): StreamPlayback | null {
  const uid = toStreamVideoUid(videoValue);
  if (!uid) {
    console.error("Stream 再生トークンを発行できません: 動画IDが32桁の16進ではありません");
    return null;
  }
  const result = readStreamConfig();
  if (!("config" in result)) {
    console.error(`Stream 再生トークンを発行できません: ${result.reason}`);
    return null;
  }
  const { config } = result;

  try {
    const token = signStreamToken(uid, config, expiresInSeconds);
    const base = `https://customer-${config.customerCode}.cloudflarestream.com/${token}`;
    return {
      iframeSrc: `${base}/iframe?autoplay=true&preload=true`,
      thumbnailSrc: `${base}/thumbnails/thumbnail.jpg?height=${STREAM_THUMBNAIL_HEIGHT_PX}`,
    };
  } catch (error) {
    // Log only the Node error code (e.g. ERR_OSSL_UNSUPPORTED): the message can echo key material.
    const code = (error as { code?: unknown }).code;
    console.error(
      `Stream 再生トークンの署名に失敗しました（${typeof code === "string" ? code : "unknown"}）`
    );
    return null;
  }
}

/**
 * Invariant: call only AFTER the content view-permission check (getServerAuth + the RLS-applied
 * fetchContentById + isContentLockedForUser), exactly like createSlideSignedUrl. Signing itself
 * needs no database access, so this function cannot enforce visibility on its own.
 */
export function createStreamPlaybackForMember(videoValue: string): StreamPlayback | null {
  return createStreamPlayback(videoValue, STREAM_TOKEN_EXPIRES_IN_SECONDS);
}

/**
 * Unauthenticated /demo: same scope as trial users (published, not deleted, is_open_to_trial),
 * decided here independent of caller branching, with the shorter demo lifetime.
 */
export function createStreamPlaybackForDemo(
  content: Pick<
    LearningContent,
    "content_type" | "video_url" | "is_published" | "is_deleted" | "is_open_to_trial"
  >
): StreamPlayback | null {
  if (
    content.content_type !== "video" ||
    !content.video_url ||
    !content.is_published ||
    content.is_deleted ||
    !content.is_open_to_trial
  ) {
    return null;
  }
  return createStreamPlayback(content.video_url, STREAM_DEMO_TOKEN_EXPIRES_IN_SECONDS);
}
