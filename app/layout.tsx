import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ColorSchemeSync } from "./components/ColorSchemeSync";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
import { OGP_IMAGE_ALT, OGP_IMAGE_PATH, SITE_DESCRIPTION, SITE_TITLE } from "./constants/ogp";
import { PWA_NAME, PWA_THEME_COLOR_DARK, PWA_THEME_COLOR_LIGHT } from "./constants/pwa";
import { buildColorSchemeInitScript } from "./lib/color-scheme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Without metadataBase the relative og:image falls back to a localhost / preview URL that
// crawlers (LINE, Facebook) cannot fetch. The image must stay under /public with a file extension
// so proxy.ts skips auth; an extensionless route would redirect crawlers to /login.
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: PWA_NAME,
    locale: "ja_JP",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OGP_IMAGE_PATH, width: 1200, height: 630, alt: OGP_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OGP_IMAGE_PATH],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: PWA_NAME,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PWA_THEME_COLOR_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: PWA_THEME_COLOR_DARK },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: buildColorSchemeInitScript(),
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen">{children}</div>
        <ColorSchemeSync />
        <ServiceWorkerRegistration />
        <Analytics />
      </body>
    </html>
  );
}
