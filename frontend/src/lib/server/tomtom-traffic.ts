// Server side only: proxies TomTom's live traffic flow vector tiles so the API key
// never reaches the browser, and keeps the number of upstream calls inside TomTom's
// free tier (200,000 vector traffic tiles a month).
//
// Three things hold the count down, in order:
//   1. Only tiles over Surabaya, between MIN_ZOOM and MAX_ZOOM, are served. The map
//      draws the lines itself and stretches MAX_ZOOM tiles further in, so zooming
//      closer costs no extra calls.
//   2. A tile fetched in the last CACHE_TTL_MS is answered from memory, and the
//      response may be kept by the CDN/browser for as long, so it is not refetched.
//   3. A daily and a monthly cap on upstream calls; past either, tiles are refused
//      until the next day (or month) and the map says why.
// The counter is kept in memory and in a small file in the OS temp folder, so a
// dev-server restart does not reset it. On a serverless host each instance keeps
// its own count; the caps are set below the free tier to leave room for that.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const KEY = process.env.TOMTOM_API_KEY?.trim() ?? "";

const FREE_TIER_MONTHLY = 200_000;
/** Upstream calls allowed per calendar month (UTC); 90 % of the free tier by default. */
export const MONTHLY_LIMIT = intEnv("TOMTOM_MONTHLY_TILE_LIMIT", Math.floor(FREE_TIER_MONTHLY * 0.9));
/** Upstream calls allowed per day (UTC), so one busy day cannot use up the month. */
export const DAILY_LIMIT = intEnv("TOMTOM_DAILY_TILE_LIMIT", Math.floor(MONTHLY_LIMIT / 31));

/** How long a fetched tile is reused before it is asked for again (TomTom updates about every minute). */
export const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_MAX_TILES = 600;

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 15;
/** Surabaya, [west, south, east, north], with a small margin. */
export const BOUNDS: [number, number, number, number] = [112.5, -7.46, 112.94, -7.09];

const STYLE = "relative";
const UPSTREAM = "https://api.tomtom.com/traffic/map/4/tile/flow";
const USAGE_FILE = path.join(os.tmpdir(), "response-tomtom-vector-usage.json");

function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function configured(): boolean {
  return KEY.length > 0;
}

// --- Which tiles may be asked for -----------------------------------------------

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/** True for a tile over Surabaya at a zoom the layer uses. */
export function tileAllowed(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z < MIN_ZOOM || z > MAX_ZOOM) return false;
  const [w, s, e, n] = BOUNDS;
  return x >= lonToTileX(w, z) && x <= lonToTileX(e, z) && y >= latToTileY(n, z) && y <= latToTileY(s, z);
}

// --- Usage counter ---------------------------------------------------------------

interface Usage {
  day: string; // YYYY-MM-DD, UTC
  month: string; // YYYY-MM, UTC
  dayCount: number;
  monthCount: number;
}

// Next bundles each route on its own, so module-level variables would give the tile
// route and the status route separate counters. One object on globalThis is shared
// by every route in the process.
interface Shared {
  usage: Usage | null;
  saveTimer: NodeJS.Timeout | null;
  cache: Map<string, { at: number; body: ArrayBuffer; type: string }>;
  inflight: Map<string, Promise<TileResult>>;
}
const g = globalThis as typeof globalThis & { __responseTomTom?: Shared };
const shared: Shared = (g.__responseTomTom ??= {
  usage: null,
  saveTimer: null,
  cache: new Map(),
  inflight: new Map(),
});

function today(): { day: string; month: string } {
  const iso = new Date().toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

async function loadUsage(): Promise<Usage> {
  if (!shared.usage) {
    let loaded: Usage;
    try {
      loaded = JSON.parse(await fs.readFile(USAGE_FILE, "utf8")) as Usage;
    } catch {
      loaded = { ...today(), dayCount: 0, monthCount: 0 };
    }
    // Another request may have loaded it while this one waited on the file.
    shared.usage ??= loaded;
  }
  const now = today();
  const u = shared.usage;
  if (u.month !== now.month) shared.usage = { ...now, dayCount: 0, monthCount: 0 };
  else if (u.day !== now.day) shared.usage = { ...u, day: now.day, dayCount: 0 };
  return shared.usage;
}

function scheduleSave(): void {
  if (shared.saveTimer) return;
  shared.saveTimer = setTimeout(() => {
    shared.saveTimer = null;
    if (shared.usage) {
      fs.writeFile(USAGE_FILE, JSON.stringify(shared.usage)).catch(() => undefined);
    }
  }, 2000);
}

export interface UsageReport {
  configured: boolean;
  day_count: number;
  day_limit: number;
  month_count: number;
  month_limit: number;
  limited: boolean;
}

export async function usageReport(): Promise<UsageReport> {
  const u = await loadUsage();
  return {
    configured: configured(),
    day_count: u.dayCount,
    day_limit: DAILY_LIMIT,
    month_count: u.monthCount,
    month_limit: MONTHLY_LIMIT,
    limited: u.dayCount >= DAILY_LIMIT || u.monthCount >= MONTHLY_LIMIT,
  };
}

// --- Tiles -----------------------------------------------------------------------

const { cache, inflight } = shared;

export type TileResult =
  | { kind: "ok"; body: ArrayBuffer; type: string }
  | { kind: "limited" }
  | { kind: "error"; status: number };

function remember(key: string, body: ArrayBuffer, type: string): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), body, type });
  while (cache.size > CACHE_MAX_TILES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function fetchUpstream(z: number, x: number, y: number, key: string): Promise<TileResult> {
  const u = await loadUsage();
  if (u.dayCount >= DAILY_LIMIT || u.monthCount >= MONTHLY_LIMIT) return { kind: "limited" };
  // Counted before the call: a failed call is billed too.
  u.dayCount += 1;
  u.monthCount += 1;
  scheduleSave();
  const url = `${UPSTREAM}/${STYLE}/${z}/${x}/${y}.pbf?key=${encodeURIComponent(KEY)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { kind: "error", status: res.status };
    const body = await res.arrayBuffer();
    const type = "application/x-protobuf";
    remember(key, body, type);
    return { kind: "ok", body, type };
  } catch {
    return { kind: "error", status: 502 };
  }
}

/** The tile from memory while fresh, else from TomTom if the caps allow. */
export async function trafficTile(z: number, x: number, y: number): Promise<TileResult> {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { kind: "ok", body: hit.body, type: hit.type };
  // Many map tiles are asked for at once; the same tile is fetched only once.
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = fetchUpstream(z, x, y, key).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
