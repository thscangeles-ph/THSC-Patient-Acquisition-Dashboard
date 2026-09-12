import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THSC Patient Acquisition Dashboard",
  description: "Upload THSC sales reports to calculate unique new patients, acquisition sources, revenue, and cost per acquired patient.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-PH">
      <body className="antialiased">{children}</body>
    </html>
  );
}
