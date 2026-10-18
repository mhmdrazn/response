import type { NextRequest } from "next/server";

import { CACHE_TTL_MS, configured, tileAllowed, trafficTile } from "@/lib/server/tomtom-traffic";

// One TomTom traffic tile, fetched with the server's key. Browsers and the CDN
// may keep it as long as the server would, so a tile is not paid for twice.
const CACHE_S = Math.floor(CACHE_TTL_MS / 1000);

export async function GET(_req: NextRequest, ctx: RouteContext<"/traffic/[z]/[x]/[y]">) {
  const { z, x, y } = await ctx.params;
  const [zi, xi, yi] = [z, x, y].map((v) => Number(v));
  if (!configured()) return new Response("TomTom belum dikonfigurasi", { status: 503 });
  if (!tileAllowed(zi, xi, yi)) return new Response("Di luar area Surabaya", { status: 404 });

  const tile = await trafficTile(zi, xi, yi);
  if (tile.kind === "limited") {
    return new Response("Batas pemakaian lalu lintas TomTom tercapai", {
      status: 429,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (tile.kind === "error") {
    return new Response("Tile TomTom tidak bisa dimuat", {
      status: tile.status === 403 ? 403 : 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return new Response(tile.body, {
    headers: {
      "Content-Type": tile.type,
      "Cache-Control": `public, max-age=${CACHE_S}, s-maxage=${CACHE_S}`,
    },
  });
}
