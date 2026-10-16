import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// Self-hosted at build time: no render-blocking request to Google Fonts on load.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter-face" });

export const metadata: Metadata = {
  title: "Response",
  description:
    "Sistem Pendukung Keputusan untuk manajemen Dinas Pemadam Kebakaran & Penyelamatan Kota Surabaya dalam menentukan rute armada penanganan banjir.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
