import type { Metadata } from "next";
import { ProviderShell } from "./components/provider-shell";
import "./globals.css";

export const metadata: Metadata = { title: "Odyssey Provider" };
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-odyssey-theme="default" lang="en">
      <body>
        <ProviderShell>{children}</ProviderShell>
      </body>
    </html>
  );
}
