import type { MetadataRoute } from "next";
import { PWA_BACKGROUND_COLOR, PWA_NAME, PWA_THEME_COLOR_LIGHT } from "@/app/constants/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PWA_NAME,
    short_name: PWA_NAME,
    start_url: "/",
    display: "standalone",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR_LIGHT,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
