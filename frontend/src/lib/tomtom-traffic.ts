// Live traffic on the map: TomTom's traffic flow vector tiles, served through this app's
// own /api/traffic-tiles proxy so the TomTom key stays on the server. The proxy
// also caps the calls to stay within TomTom's free tier (see lib/server).

export const TRAFFIC_TILE_URL = "/api/traffic-tiles/{z}/{x}/{y}";
const STATUS_URL = "/api/traffic-tiles/status";

/** Same as the proxy: tiles exist from MIN to MAX zoom, over Surabaya only. */
export const TRAFFIC_MIN_ZOOM = 10;
/** Tiles stop here; the lines are drawn by the map, so they stay sharp further in. */
export const TRAFFIC_MAX_ZOOM = 15;
export const TRAFFIC_BOUNDS: [number, number, number, number] = [112.5, -7.46, 112.94, -7.09];

/** New tiles this often while the layer is on and the page is visible. */
export const TRAFFIC_REFRESH_MS = 5 * 60 * 1000;

/** TomTom's relative flow colours, for the legend beside the layer. */
export const TRAFFIC_LEGEND = [
  { label: "Lancar", color: "#3DB548" },
  { label: "Ramai", color: "#F5A623" },
  { label: "Padat", color: "#E8392E" },
  { label: "Macet", color: "#8C1C13" },
] as const;

export interface TrafficTilesStatus {
  configured: boolean;
  day_count: number;
  day_limit: number;
  month_count: number;
  month_limit: number;
  limited: boolean;
}

export async function fetchTrafficTilesStatus(): Promise<TrafficTilesStatus> {
  const res = await fetch(STATUS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as TrafficTilesStatus;
}
