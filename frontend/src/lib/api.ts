import type {
  ACSParams,
  DataMetaResponse,
  Depot,
  Faskes,
  FloodPoint,
  IntermediateFacility,
  OptimizationResult,
  ScenarioList,
  SeverityIndexResponse,
  TrafficStatus,
  VNSParams,
} from "../types";
import {
  addFlood,
  floodsUpdatedAt,
  forgetFloods,
  holdFloods,
  holdShared,
  isCanvasScenario,
  localFloods,
  localShared,
  overridesFor,
  removeFlood,
  replaceFlood,
  setShared,
  sharedNextNumber,
  sharedOverrides,
  sharedUpdatedAt,
  withoutLegs,
  type LocalFlood,
  type SharedName,
  type SharedRows,
} from "./local-data";

export type AlgorithmType = "acs" | "vns";

/** What a depot fields when no fleet is configured (from the backend). */
export interface FleetDefaults {
  capacities_l: number[];
  units_per_capacity: number;
  operating_minutes: number;
}

export type RunRequest =
  { algorithm: "acs"; params: ACSParams } | { algorithm: "vns"; params: VNSParams };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    // A body can be read once, so take it as text and only then try it as JSON;
    // reading it as JSON first and falling back to text threw "body stream already
    // read" and hid the server's real message.
    const raw = await res.text().catch(() => "");
    let detail = raw;
    try {
      const body = JSON.parse(raw);
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      /* not JSON: keep the text as it is */
    }
    throw new ApiError(res.status, detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export { ApiError };

// ---- Edits held by the browser ----------------------------------------------
// The server keeps no edits (see lib/local-data.ts): reads of an edited dataset
// come from this browser, edits are checked or enriched by the server and kept
// here, and runs send the edited datasets along.

/** Append `?scenario=<id>` when a scenario is given. */
function s(path: string, scenario?: string): string {
  return scenario ? `${path}?scenario=${encodeURIComponent(scenario)}` : path;
}

/** Fields of a flood point the server enriches (road class, clinic distance, workload). */
interface FloodInput {
  lat: number;
  lon: number;
  datetime?: string | null;
  deskripsi?: string | null;
  ketinggian_cm?: number | null;
  volume_l?: number | null;
}

function notFound(label: string, id: string): ApiError {
  return new ApiError(404, `${label} id='${id}' tidak ditemukan.`);
}

function needScenario(): ApiError {
  return new ApiError(400, "Pilih area studi terlebih dahulu.");
}

function numberOr(value: unknown, fallback: number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback ?? null;
}

function textOr(value: unknown, fallback: string | null | undefined): string | null {
  if (typeof value === "string") return value;
  return fallback ?? null;
}

/** A body with the edited datasets the request needs, when there are any. */
function withData<T extends object>(body: T, scenario?: string): T & { data?: object } {
  const data = overridesFor(scenario);
  return data ? { ...body, data } : body;
}

/** The scenario's points, held by this browser from now on (a copy of the server's at first). */
async function heldFloods(scenario: string): Promise<LocalFlood[]> {
  const held = localFloods(scenario);
  if (held) return held;
  holdFloods(scenario, await request<FloodPoint[]>(s("/api/data/floods", scenario)));
  return localFloods(scenario) ?? [];
}

/** A flood point worked out by the server (nothing is stored there). */
async function enrichFlood(
  scenario: string,
  point: FloodInput,
  editing?: string,
): Promise<LocalFlood> {
  const others = (await heldFloods(scenario)).filter((p) => p.id !== editing);
  return request<LocalFlood>("/api/data/floods/enrich", {
    method: "POST",
    body: JSON.stringify({ point, others, data: sharedOverrides() }),
  });
}

/** An edit to a flood point, with the rules the server used for stored ones. */
async function updateHeldFlood(
  scenario: string,
  id: string,
  body: Record<string, unknown>,
): Promise<FloodPoint> {
  const current = (await heldFloods(scenario)).find((p) => p.id === id);
  if (!current) throw notFound("flood", id);
  const lat = numberOr(body.lat, current.lat) ?? current.lat;
  const lon = numberOr(body.lon, current.lon) ?? current.lon;
  const depth = numberOr(body.ketinggian_cm, current.ketinggian_cm);
  const volumeGiven = typeof body.volume_l === "number";
  const moved = lat !== current.lat || lon !== current.lon;
  const deeper = depth !== current.ketinggian_cm;
  const next = {
    datetime: textOr(body.datetime, current.datetime),
    deskripsi: textOr(body.deskripsi, current.deskripsi),
  };
  if (!moved && !deeper) {
    // Nothing the road class or workload depend on changed: no server round trip.
    const volume = volumeGiven ? numberOr(body.volume_l, current.volume_l) : current.volume_l;
    return replaceFlood(scenario, id, { ...current, ...next, volume_l: volume });
  }
  // A move or a new depth: the server works the point out again. Its workload is
  // estimated afresh unless the edit set one.
  const enriched = await enrichFlood(
    scenario,
    {
      lat,
      lon,
      ...next,
      ketinggian_cm: depth,
      volume_l: volumeGiven ? numberOr(body.volume_l, null) : null,
    },
    id,
  );
  return replaceFlood(scenario, id, enriched);
}

const SHARED_LABEL: Record<SharedName, string> = { depo: "depot", if: "if", faskes: "faskes" };
const SHARED_ID_PREFIX: Record<SharedName, string> = { depo: "D_", if: "IF_", faskes: "H_" };

/** A shared dataset as this browser holds it (a copy of the server's at first). */
async function heldShared<K extends SharedName>(name: K): Promise<SharedRows[K][]> {
  const held = localShared(name);
  if (held) return held;
  holdShared(name, await request<SharedRows[K][]>(`/api/data/${name}`), SHARED_ID_PREFIX[name]);
  return localShared(name) ?? [];
}

/** A row checked by the server (bounds, types); nothing is stored there. */
function checkShared<K extends SharedName>(name: K, row: object): Promise<SharedRows[K]> {
  return request<SharedRows[K]>(`/api/data/${name}/check`, {
    method: "POST",
    body: JSON.stringify(row),
  });
}

async function createShared<K extends SharedName>(name: K, body: object): Promise<SharedRows[K]> {
  const rows = await heldShared(name);
  const checked = await checkShared(name, body);
  if (name === "if") {
    // Outlets have no OSM id to name them by: the browser numbers them.
    const id = `IF_${String(sharedNextNumber("if")).padStart(3, "0")}`;
    const row = { ...checked, id };
    setShared(name, [...rows, row], true);
    return row;
  }
  if (rows.some((r) => r.id === checked.id)) {
    throw new ApiError(409, `${SHARED_LABEL[name]} dengan osm_id ini sudah ada (${checked.id}).`);
  }
  setShared(name, [...rows, checked]);
  return checked;
}

async function updateShared<K extends SharedName>(
  name: K,
  id: string,
  body: Record<string, unknown>,
): Promise<SharedRows[K]> {
  const rows = await heldShared(name);
  const current = rows.find((r) => r.id === id);
  if (!current) throw notFound(SHARED_LABEL[name], id);
  const merged: Record<string, unknown> = { ...current };
  delete merged.id;
  for (const [k, v] of Object.entries(body)) if (v !== null && v !== undefined) merged[k] = v;
  // The id stays, as it did when the server stored edits.
  const row = { ...(await checkShared(name, merged)), id };
  setShared(
    name,
    rows.map((r) => (r.id === id ? row : r)),
  );
  return row;
}

async function deleteShared(name: SharedName, id: string): Promise<void> {
  const rows = await heldShared(name);
  if (!rows.some((r) => r.id === id)) throw notFound(SHARED_LABEL[name], id);
  setShared(
    name,
    rows.filter((r) => r.id !== id),
  );
}

function sharedOr<K extends SharedName>(name: K, scenario?: string): Promise<SharedRows[K][]> {
  const held = localShared(name);
  return held ? Promise.resolve(held) : request<SharedRows[K][]>(s(`/api/data/${name}`, scenario));
}

export const api = {
  health: (): Promise<{ status: string; service: string }> => request("/health"),

  getScenarios: (): Promise<ScenarioList> => request<ScenarioList>("/api/scenarios"),
  /** Empties the blank canvas (the study areas cannot be reset). */
  resetScenario: (scenario: string): Promise<void> => {
    if (isCanvasScenario(scenario)) {
      forgetFloods(scenario);
      return Promise.resolve();
    }
    return request<void>(`/api/scenarios/${encodeURIComponent(scenario)}/reset`, {
      method: "POST",
    });
  },

  getFloodPoints: (scenario?: string): Promise<FloodPoint[]> => {
    const held = localFloods(scenario);
    return held
      ? Promise.resolve(withoutLegs(held))
      : request<FloodPoint[]>(s("/api/data/floods", scenario));
  },
  getDepots: (scenario?: string): Promise<Depot[]> => sharedOr("depo", scenario),
  getIntermediateFacilities: (scenario?: string): Promise<IntermediateFacility[]> =>
    sharedOr("if", scenario),
  getFaskes: (scenario?: string): Promise<Faskes[]> => sharedOr("faskes", scenario),

  /** The index under the default weights, or under user-set `weights` when given. */
  getSeverityIndex: (
    scenario?: string,
    weights?: number[] | null,
  ): Promise<SeverityIndexResponse> => {
    const data = overridesFor(scenario);
    return weights || data
      ? request<SeverityIndexResponse>(s("/api/severity-index", scenario), {
          method: "POST",
          body: JSON.stringify({ weights: weights ?? null, ...(data ? { data } : {}) }),
        })
      : request<SeverityIndexResponse>(s("/api/severity-index", scenario));
  },

  getFleetDefaults: (): Promise<FleetDefaults> =>
    request<FleetDefaults>("/api/optimize/fleet-defaults"),
  getTrafficStatus: (): Promise<TrafficStatus> => request<TrafficStatus>("/api/traffic/status"),

  getDataMeta: async (scenario?: string): Promise<DataMetaResponse> => {
    const meta = await request<DataMetaResponse>(s("/api/data/meta", scenario));
    // Datasets edited in this browser: its copy, not the server's.
    const out: DataMetaResponse = { ...meta };
    const floods = localFloods(scenario);
    if (floods) out.floods = { updated_at: floodsUpdatedAt(scenario), rows: floods.length };
    for (const name of ["depo", "if", "faskes"] as const) {
      const rows = localShared(name);
      if (rows) out[name] = { updated_at: sharedUpdatedAt(name), rows: rows.length };
    }
    return out;
  },

  runACS: (params: ACSParams, scenario?: string): Promise<OptimizationResult> =>
    request<OptimizationResult>(s("/api/optimize/acs", scenario), {
      method: "POST",
      body: JSON.stringify(withData(params, scenario)),
    }),
  runVNS: (params: VNSParams, scenario?: string): Promise<OptimizationResult> =>
    request<OptimizationResult>(s("/api/optimize/vns", scenario), {
      method: "POST",
      body: JSON.stringify(withData(params, scenario)),
    }),

  createFlood: async (
    body: Omit<FloodPoint, "id" | "si_value">,
    scenario?: string,
  ): Promise<FloodPoint> => {
    if (!scenario) throw needScenario();
    return addFlood(scenario, await enrichFlood(scenario, body));
  },
  updateFlood: (
    id: string,
    body: Record<string, unknown>,
    scenario?: string,
  ): Promise<FloodPoint> =>
    scenario ? updateHeldFlood(scenario, id, body) : Promise.reject(needScenario()),
  deleteFlood: async (id: string, scenario?: string): Promise<void> => {
    if (!scenario) throw needScenario();
    await heldFloods(scenario);
    if (!removeFlood(scenario, id)) throw notFound("flood", id);
  },

  // Depots, outlets and clinics are shared by every scenario.
  createDepot: (body: Omit<Depot, "id">): Promise<Depot> => createShared("depo", body),
  updateDepot: (id: string, body: Record<string, unknown>): Promise<Depot> =>
    updateShared("depo", id, body),
  deleteDepot: (id: string): Promise<void> => deleteShared("depo", id),

  createIF: (body: Omit<IntermediateFacility, "id">): Promise<IntermediateFacility> =>
    createShared("if", body),
  updateIF: (id: string, body: Record<string, unknown>): Promise<IntermediateFacility> =>
    updateShared("if", id, body),
  deleteIF: (id: string): Promise<void> => deleteShared("if", id),

  createFaskes: (body: Omit<Faskes, "id">): Promise<Faskes> => createShared("faskes", body),
  updateFaskes: (id: string, body: Record<string, unknown>): Promise<Faskes> =>
    updateShared("faskes", id, body),
  deleteFaskes: (id: string): Promise<void> => deleteShared("faskes", id),
};

export const DEFAULT_ACS_PARAMS: ACSParams = {
  iterations: 1000,
  n_ants: 20,
  alpha: 1.0,
  beta: 1.0,
  rho: 0.15,
  q0: 0.7,
  seed: 42,
  time_limit_s: 45,
};

export const DEFAULT_VNS_PARAMS: VNSParams = {
  max_iterations: 1000,
  k_max: 3,
  seed: 42,
  time_limit_s: 45,
};
