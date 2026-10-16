import type { NextConfig } from "next";

// The basemap tiles, glyphs and district outlines change only when they are
// rebuilt; let browsers keep them for a day (and use them while revalidating for
// a week) instead of re-checking every tile on every visit.
const STATIC_DATA_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/tiles/:path*", headers: [{ key: "Cache-Control", value: STATIC_DATA_CACHE }] },
      { source: "/data/:path*", headers: [{ key: "Cache-Control", value: STATIC_DATA_CACHE }] },
    ];
  },
};

export default nextConfig;
