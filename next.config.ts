import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
