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
  VNSParams,
} from "../types";

export type AlgorithmType = "acs" | "vns";

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
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new ApiError(res.status, detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export { ApiError };

/** Append `?scenario=<id>` when a scenario is given. */
function s(path: string, scenario?: string): string {
  return scenario ? `${path}?scenario=${encodeURIComponent(scenario)}` : path;
}

export const api = {
  health: (): Promise<{ status: string; service: string }> => request("/health"),

  getScenarios: (): Promise<ScenarioList> => request<ScenarioList>("/api/scenarios"),

  getFloodPoints: (scenario?: string): Promise<FloodPoint[]> =>
    request<FloodPoint[]>(s("/api/data/floods", scenario)),
  getDepots: (scenario?: string): Promise<Depot[]> => request<Depot[]>(s("/api/data/depo", scenario)),
  getIntermediateFacilities: (scenario?: string): Promise<IntermediateFacility[]> =>
    request<IntermediateFacility[]>(s("/api/data/if", scenario)),
  getFaskes: (scenario?: string): Promise<Faskes[]> =>
    request<Faskes[]>(s("/api/data/faskes", scenario)),

  getSeverityIndex: (scenario?: string): Promise<SeverityIndexResponse> =>
    request<SeverityIndexResponse>(s("/api/severity-index", scenario)),

  getDataMeta: (scenario?: string): Promise<DataMetaResponse> =>
    request<DataMetaResponse>(s("/api/data/meta", scenario)),

  runACS: (params: ACSParams, scenario?: string): Promise<OptimizationResult> =>
    request<OptimizationResult>(s("/api/optimize/acs", scenario), {
      method: "POST",
      body: JSON.stringify(params),
    }),
  runVNS: (params: VNSParams, scenario?: string): Promise<OptimizationResult> =>
    request<OptimizationResult>(s("/api/optimize/vns", scenario), {
      method: "POST",
      body: JSON.stringify(params),
    }),

  createFlood: (body: Omit<FloodPoint, "id" | "si_value">, scenario?: string): Promise<FloodPoint> =>
    request<FloodPoint>(s("/api/data/floods", scenario), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateFlood: (id: string, body: Record<string, unknown>, scenario?: string): Promise<FloodPoint> =>
    request<FloodPoint>(s(`/api/data/floods/${encodeURIComponent(id)}`, scenario), {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteFlood: (id: string, scenario?: string): Promise<void> =>
    request<void>(s(`/api/data/floods/${encodeURIComponent(id)}`, scenario), { method: "DELETE" }),

  createDepot: (body: Omit<Depot, "id">, scenario?: string): Promise<Depot> =>
    request<Depot>(s("/api/data/depo", scenario), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDepot: (id: string, body: Record<string, unknown>, scenario?: string): Promise<Depot> =>
    request<Depot>(s(`/api/data/depo/${encodeURIComponent(id)}`, scenario), {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteDepot: (id: string, scenario?: string): Promise<void> =>
    request<void>(s(`/api/data/depo/${encodeURIComponent(id)}`, scenario), { method: "DELETE" }),

  createIF: (body: Omit<IntermediateFacility, "id">, scenario?: string): Promise<IntermediateFacility> =>
    request<IntermediateFacility>(s("/api/data/if", scenario), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateIF: (
    id: string,
    body: Record<string, unknown>,
    scenario?: string,
  ): Promise<IntermediateFacility> =>
    request<IntermediateFacility>(s(`/api/data/if/${encodeURIComponent(id)}`, scenario), {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteIF: (id: string, scenario?: string): Promise<void> =>
    request<void>(s(`/api/data/if/${encodeURIComponent(id)}`, scenario), { method: "DELETE" }),

  createFaskes: (body: Omit<Faskes, "id">, scenario?: string): Promise<Faskes> =>
    request<Faskes>(s("/api/data/faskes", scenario), {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateFaskes: (id: string, body: Record<string, unknown>, scenario?: string): Promise<Faskes> =>
    request<Faskes>(s(`/api/data/faskes/${encodeURIComponent(id)}`, scenario), {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteFaskes: (id: string, scenario?: string): Promise<void> =>
    request<void>(s(`/api/data/faskes/${encodeURIComponent(id)}`, scenario), { method: "DELETE" }),
};

export const DEFAULT_ACS_PARAMS: ACSParams = {
  iterations: 60,
  n_ants: 20,
  alpha: 1.0,
  beta: 1.0,
  rho: 0.15,
  q0: 0.7,
  seed: 42,
  time_limit_s: 45,
};

export const DEFAULT_VNS_PARAMS: VNSParams = {
  max_iterations: 100,
  k_max: 3,
  seed: 42,
  time_limit_s: 45,
};
