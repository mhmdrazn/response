// Live traffic on the map: Google Maps Platform's Map Tiles API, as a transparent
// overlay of traffic colours drawn over our own basemap (`overlay: true` is the
// documented way to use Google's layers on another map). The key is a browser
// key: restrict it to your site's referrers and to the Map Tiles API only.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

const SESSION_URL = "https://tile.googleapis.com/v1/createSession";
const TILE_URL = "https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}";

/** A new session (and so new tile URLs) this often, so the colours stay current. */
export const TRAFFIC_REFRESH_MS = 5 * 60 * 1000;

/** Google's own traffic colours, for the legend beside the layer. */
export const TRAFFIC_LEGEND = [
  { label: "Lancar", color: "#63D668" },
  { label: "Ramai", color: "#FF974D" },
  { label: "Padat", color: "#F23C32" },
  { label: "Macet", color: "#811F1F" },
] as const;

export function trafficTilesConfigured(): boolean {
  return KEY.length > 0;
}

interface SessionResponse {
  session: string;
  expiry: string;
  tileWidth: number;
  tileHeight: number;
}

export class TrafficTilesError extends Error {}

/** Opens a Map Tiles session for the traffic overlay and returns its tile URL template. */
export async function trafficTileUrl(): Promise<string> {
  if (!KEY) {
    throw new TrafficTilesError("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY belum diisi.");
  }
  const res = await fetch(`${SESSION_URL}?key=${encodeURIComponent(KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mapType: "roadmap",
      language: "id-ID",
      region: "ID",
      layerTypes: ["layerTraffic"],
      // Traffic only, on a transparent background, to lay over our basemap.
      overlay: true,
      scale: "scaleFactor2x",
      highDpi: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let reason = text.slice(0, 200);
    try {
      reason = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? reason;
    } catch {
      /* keep the raw text */
    }
    throw new TrafficTilesError(`Map Tiles API menolak sesi (${res.status}): ${reason}`);
  }
  const data = JSON.parse(text) as SessionResponse;
  return `${TILE_URL}?session=${encodeURIComponent(data.session)}&key=${encodeURIComponent(KEY)}`;
}
