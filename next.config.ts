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

// Script-restricting CSP directives are left out on purpose: the exercise preview is a srcdoc
// iframe, which inherits this page's CSP, so limiting script-src would stop learners' inline
// scripts and the React preview's Babel (eval). frame-ancestors / X-Frame-Options do not apply to
// srcdoc frames, so the preview still loads.
// Referrer-Policy must keep sending the origin cross-site: Cloudflare Stream checks Allowed Origins.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

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
  async redirects() {
    // Pre-#426 content URLs carried a week segment; mail links, certificates and bookmarks still
    // point there. Numeric segments only so they cannot shadow other /learn or /demo routes.
    return [
      {
        source: "/learn/:themeId(\\d+)/:phaseId(\\d+)/:weekId(\\d+)/:contentId(\\d+)",
        destination: "/learn/:themeId/:phaseId/:contentId",
        permanent: true,
      },
      {
        source: "/demo/:themeId(\\d+)/:phaseId(\\d+)/:weekId(\\d+)/:contentId(\\d+)",
        destination: "/demo/:themeId/:phaseId/:contentId",
        permanent: true,
      },
      // The week admin pages are gone; the tree at /manage/contents replaces them.
      { source: "/manage/weeks/:path*", destination: "/manage/contents", permanent: true },
      { source: "/admin/weeks/:path*", destination: "/manage/contents", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
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
