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
      // pdf.js 6 の通常ビルドは最新ブラウザ専用（polyfill なし）のため legacy ビルドへ差し替える
      "pdfjs-dist": "pdfjs-dist/legacy/build/pdf.mjs",
      "pdfjs-dist/web/pdf_viewer.mjs": "pdfjs-dist/legacy/web/pdf_viewer.mjs",
    },
  },
  webpack: (config) => {
    // react-pdf: canvas依存を除外（webpack使用時）
    config.resolve.alias.canvas = false;
    // pdf.js 6 の通常ビルドは最新ブラウザ専用（polyfill なし）のため legacy ビルドへ差し替える
    config.resolve.alias["pdfjs-dist$"] = "pdfjs-dist/legacy/build/pdf.mjs";
    config.resolve.alias["pdfjs-dist/web/pdf_viewer.mjs$"] = "pdfjs-dist/legacy/web/pdf_viewer.mjs";
    return config;
  },
};

export default nextConfig;
