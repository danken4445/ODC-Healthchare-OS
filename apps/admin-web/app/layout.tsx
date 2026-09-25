import type { Metadata } from "next";
import { AdminShell } from "../components/admin-shell";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Odyssey Administration", template: "%s | Odyssey Administration" },
  description: "Clinical operations, revenue, compliance, and network administration.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AdminShell>{children}</AdminShell></body>
    </html>
  );
}
