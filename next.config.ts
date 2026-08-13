import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: process.env.NEXT_PUBLIC_SUPABASE_URL
    ? {
        remotePatterns: [
          new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/**`),
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
