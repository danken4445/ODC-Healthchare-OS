import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Odyssey Patient Portal",
  description: "Odyssey Healthcare OS - Mobile Patient Portal",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Odyssey Health",
  },
  formatDetection: {
    telephone: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-odyssey-theme="default" lang="en">
      <body>{children}</body>
    </html>
  );
}
