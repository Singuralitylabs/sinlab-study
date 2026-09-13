import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseUrlParts = supabaseUrl ? new URL(supabaseUrl) : null;
const supabaseProtocol: "http" | "https" | undefined = supabaseUrlParts
  ? supabaseUrlParts.protocol === "http:"
    ? "http"
    : "https"
  : undefined;

// YouTube サムネイルは `<img>` で i.ytimg.com を直接参照するため remotePatterns に含めない
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [];

if (supabaseUrlParts && supabaseProtocol) {
  remotePatterns.push({
    protocol: supabaseProtocol,
    hostname: supabaseUrlParts.hostname,
    pathname: "/storage/v1/object/public/thumbnails/**",
  });
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
  experimental: {
    // lucide-react は Next.js 既定の optimizePackageImports に含まれるためここでは指定しない
    optimizePackageImports: ["radix-ui"],
  },
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
