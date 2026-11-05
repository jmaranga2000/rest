import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { ToastProvider } from "@/ui/Toast";
import { PwaServiceWorker } from "@/ui/PwaServiceWorker";
import { THEME_BOOT_SCRIPT } from "@/ui/ThemeToggle";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Restaurant OS", template: "%s · Restaurant OS" },
  description: "Point of sale, kitchen display, inventory and reporting for restaurants.",
  applicationName: "Restaurant OS",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Restaurant OS", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f6f3" }, { media: "(prefers-color-scheme: dark)", color: "#0d0d0c" }] };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined; // set per request by src/middleware.ts (CSP)
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} /></head>
      <body><ToastProvider>{children}<PwaServiceWorker /></ToastProvider></body>
    </html>
  );
}
