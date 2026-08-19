import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseUrlParts = supabaseUrl ? new URL(supabaseUrl) : null;
const supabaseProtocol: "http" | "https" | undefined = supabaseUrlParts
  ? supabaseUrlParts.protocol === "http:"
    ? "http"
    : "https"
  : undefined;

const nextConfig: NextConfig = {
  images:
    supabaseUrlParts && supabaseProtocol
      ? {
          remotePatterns: [
            {
              protocol: supabaseProtocol,
              hostname: supabaseUrlParts.hostname,
              pathname: "/storage/v1/object/public/thumbnails/**",
            },
          ],
        }
      : undefined,
  turbopack: {
    resolveAlias: {
      // react-pdf: canvas依存を除外（サーバーサイドビルドエラー防止）
      canvas: { browser: "./empty-module.js" },
    },
  },
  webpack: (config) => {
    // react-pdf: canvas依存を除外（webpack使用時）
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
