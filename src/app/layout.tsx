import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./quote.css";

export const metadata: Metadata = {
  title: "Simple CRM",
  description: "Simple Solution",
  robots: { index: false, follow: false },
  icons: { icon: "/crm-icon.png", apple: "/apple-icon.png" },
  appleWebApp: { capable: true, title: "Simple CRM", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
