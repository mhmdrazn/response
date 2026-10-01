import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Response",
  description:
    "Sistem Pendukung Keputusan untuk manajemen Dinas Pemadam Kebakaran & Penyelamatan Kota Surabaya dalam menentukan rute armada penanganan banjir.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
