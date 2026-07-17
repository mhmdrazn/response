import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-manrope-google",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Response",
  description:
    "Sistem Pendukung Keputusan untuk manajemen Dinas Pemadam Kebakaran & Penyelamatan Kota Surabaya dalam menentukan rute armada penanganan banjir.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={manrope.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
