import type { Depot, Faskes, FloodPoint, IntermediateFacility } from "../types";
import { readJSON, writeJSON } from "./storage";

/**
 * Data edits held by the browser.
 *
 * The server keeps no edits: on a serverless deployment (Vercel) each request may
 * run on a different short-lived instance with its own disk, so an edit saved by
 * one request was missing for the next (points placed on the canvas vanished). So
 * the page keeps every edit here, saved in this browser so a reload keeps it, and
 * `lib/api.ts` sends the edited datasets with each request that computes
 * something (app.data.overlay on the server lays them over the stored data).
 *
 * Flood points are kept per scenario: the canvas's always, a study area's once one
 * of its points is edited. Depots, outlets and clinics are shared by every
 * scenario, and kept once one of their rows is edited.
 */

export const CANVAS_SCENARIO_ID = "kanvas";

/** Road legs to and from the depots and outlets, measured once by the server. */
export interface FloodLegs {
  key: string;
  to_m: number[];
  from_m: number[];
  to_s: number[];
  from_s: number[];
}

export type LocalFlood = FloodPoint & { legs?: FloodLegs | null };

export type SharedName = "depo" | "if" | "faskes";
export interface SharedRows {
  depo: Depot;
  if: IntermediateFacility;
  faskes: Faskes;
}

interface Kept<T> {
  rows: T[];
  /** The next number for an id the browser gives (never reused). */
  next: number;
  updatedAt: string;
}

interface Store {
  version: 1;
  floods: Record<string, Kept<LocalFlood>>;
  shared: { depo?: Kept<Depot>; if?: Kept<IntermediateFacility>; faskes?: Kept<Faskes> };
}

const STORAGE_KEY = "response.local-data.v1";
let store: Store | null = null;

function load(): Store {
  if (store) return store;
  const saved = readJSON<Store | null>(STORAGE_KEY, null);
  store = saved && saved.version === 1 ? saved : { version: 1, floods: {}, shared: {} };
  return store;
}

function save(): void {
  writeJSON(STORAGE_KEY, load());
}

function now(): string {
  return new Date().toISOString();
}

/** The number after the highest `<prefix><number>` id, so new ids never collide. */
export function nextNumber(ids: string[], prefix: string): number {
  let max = -1;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

export function isCanvasScenario(scenario?: string): boolean {
  return scenario === CANVAS_SCENARIO_ID;
}

// ---- Flood points ----------------------------------------------------------

/** The scenario's points if the browser holds them (always for the canvas). */
export function localFloods(scenario?: string): LocalFlood[] | null {
  if (!scenario) return null;
  const kept = load().floods[scenario];
  if (kept) return kept.rows.map((p) => ({ ...p }));
  return isCanvasScenario(scenario) ? [] : null;
}

/** The points as the map and tables show them (without the routing legs). */
export function withoutLegs(points: LocalFlood[]): FloodPoint[] {
  return points.map((p) => {
    const flood: LocalFlood = { ...p };
    delete flood.legs;
    return flood;
  });
}

export function floodsUpdatedAt(scenario?: string): string | null {
  return scenario ? (load().floods[scenario]?.updatedAt ?? null) : null;
}

/** Start holding a scenario's points, from the server's copy. */
export function holdFloods(scenario: string, rows: FloodPoint[]): void {
  const s = load();
  if (s.floods[scenario]) return;
  s.floods[scenario] = {
    rows: rows.map((r) => ({ ...r })),
    next: nextNumber(
      rows.map((r) => r.id),
      "F_",
    ),
    updatedAt: now(),
  };
  save();
}

export function addFlood(scenario: string, point: LocalFlood): LocalFlood {
  const kept = load().floods[scenario] ?? { rows: [], next: 0, updatedAt: now() };
  const added = { ...point, id: `F_${String(kept.next).padStart(4, "0")}` };
  load().floods[scenario] = {
    rows: [...kept.rows, added],
    next: kept.next + 1,
    updatedAt: now(),
  };
  save();
  return added;
}

export function replaceFlood(scenario: string, id: string, point: LocalFlood): LocalFlood {
  const kept = load().floods[scenario];
  const replaced = { ...point, id };
  if (kept) {
    kept.rows = kept.rows.map((p) => (p.id === id ? replaced : p));
    kept.updatedAt = now();
    save();
  }
  return replaced;
}

export function removeFlood(scenario: string, id: string): boolean {
  const kept = load().floods[scenario];
  if (!kept || !kept.rows.some((p) => p.id === id)) return false;
  kept.rows = kept.rows.filter((p) => p.id !== id);
  kept.updatedAt = now();
  save();
  return true;
}

/** Empty the canvas, or drop a study area's edits so it is the server's again. */
export function forgetFloods(scenario: string): void {
  const s = load();
  if (isCanvasScenario(scenario)) {
    s.floods[scenario] = { rows: [], next: 0, updatedAt: now() };
  } else {
    delete s.floods[scenario];
  }
  save();
}

// ---- Depots, outlets, clinics ---------------------------------------------

export function localShared<K extends SharedName>(name: K): SharedRows[K][] | null {
  const kept = load().shared[name] as Kept<SharedRows[K]> | undefined;
  return kept ? kept.rows.map((r) => ({ ...r })) : null;
}

export function sharedUpdatedAt(name: SharedName): string | null {
  return load().shared[name]?.updatedAt ?? null;
}

/** Start holding a shared dataset, from the server's copy. */
export function holdShared<K extends SharedName>(
  name: K,
  rows: SharedRows[K][],
  idPrefix: string,
): void {
  const s = load();
  if (s.shared[name]) return;
  const kept: Kept<SharedRows[K]> = {
    rows: rows.map((r) => ({ ...r })),
    next: nextNumber(
      rows.map((r) => r.id),
      idPrefix,
    ),
    updatedAt: now(),
  };
  (s.shared as Record<SharedName, Kept<SharedRows[SharedName]>>)[name] = kept;
  save();
}

/** Write a held shared dataset back after an edit; `takeNumber` reserves an id number. */
export function setShared<K extends SharedName>(
  name: K,
  rows: SharedRows[K][],
  takeNumber = false,
): number {
  const s = load();
  const kept = s.shared[name] as Kept<SharedRows[K]> | undefined;
  const next = kept?.next ?? 0;
  (s.shared as Record<SharedName, Kept<SharedRows[SharedName]>>)[name] = {
    rows,
    next: takeNumber ? next + 1 : next,
    updatedAt: now(),
  };
  save();
  return next;
}

export function sharedNextNumber(name: SharedName): number {
  return load().shared[name]?.next ?? 0;
}

/** Drop the edits to depots, outlets and clinics: the server's copies again. */
export function forgetShared(): void {
  load().shared = {};
  save();
}

// ---- What a request carries -----------------------------------------------

export interface DataOverrides {
  floods?: LocalFlood[];
  depo?: Depot[];
  if?: IntermediateFacility[];
  faskes?: Faskes[];
}

/** The edited datasets a request about `scenario` sends, or null when nothing is edited. */
export function overridesFor(scenario?: string): DataOverrides | null {
  const out: DataOverrides = {};
  const floods = localFloods(scenario);
  if (floods) out.floods = floods;
  const depo = localShared("depo");
  if (depo) out.depo = depo;
  const ifs = localShared("if");
  if (ifs) out.if = ifs;
  const faskes = localShared("faskes");
  if (faskes) out.faskes = faskes;
  return Object.keys(out).length > 0 ? out : null;
}

/** The edited depots, outlets and clinics only (for enriching a flood point). */
export function sharedOverrides(): DataOverrides | null {
  const out = overridesFor(undefined);
  return out;
}
