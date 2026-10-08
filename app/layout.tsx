import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "THSC Patient Acquisition Dashboard",
  description: "Upload THSC sales reports to calculate unique new patients, acquisition sources, revenue, and cost per acquired patient.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "THSC Dashboard", statusBarStyle: "black" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#2f281c" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-PH">
      <body className="antialiased">{children}<RegisterServiceWorker /></body>
    </html>
  );
}
