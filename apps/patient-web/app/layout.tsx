import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Odyssey Patient Portal",
  description: "Odyssey Healthcare OS",
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
