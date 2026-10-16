import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ColorSchemeSync } from "./components/ColorSchemeSync";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
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

export const metadata: Metadata = {
  title: PWA_NAME,
  description: "シンギュラリティ・ラボ Web技術学習支援サービス",
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
