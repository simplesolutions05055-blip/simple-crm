import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Simple CRM",
    short_name: "Simple CRM",
    start_url: "/",
    scope: "/",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#0E0C26",
    theme_color: "#0E0C26",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
