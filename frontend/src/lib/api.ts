import type {
  ACSParams,
  Depot,
  Faskes,
  FloodPoint,
  IntermediateFacility,
  OptimizationResult,
  SeverityIndexResponse,
  VNSParams,
} from "../types";

export type AlgorithmType = "acs" | "vns";

export type RunRequest =
  | { algorithm: "acs"; params: ACSParams }
  | { algorithm: "vns"; params: VNSParams };

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
      detail =
        typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new ApiError(res.status, detail || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export { ApiError };

export const api = {
  // Meta
  health: (): Promise<{ status: string; service: string }> =>
    request("/health"),

  // Data
  getFloodPoints: (): Promise<FloodPoint[]> =>
    request<FloodPoint[]>("/api/data/floods"),
  getDepots: (): Promise<Depot[]> => request<Depot[]>("/api/data/depo"),
  getIntermediateFacilities: (): Promise<IntermediateFacility[]> =>
    request<IntermediateFacility[]>("/api/data/if"),
  getFaskes: (): Promise<Faskes[]> => request<Faskes[]>("/api/data/faskes"),

  // Severity Index
  getSeverityIndex: (): Promise<SeverityIndexResponse> =>
    request<SeverityIndexResponse>("/api/severity-index"),

  // Optimization
  runACS: (params: ACSParams): Promise<OptimizationResult> =>
    request<OptimizationResult>("/api/optimize/acs", {
      method: "POST",
      body: JSON.stringify(params),
    }),
  runVNS: (params: VNSParams): Promise<OptimizationResult> =>
    request<OptimizationResult>("/api/optimize/vns", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  // CRUD — Floods
  createFlood: (body: Omit<FloodPoint, "id" | "si_value">): Promise<FloodPoint> =>
    request<FloodPoint>("/api/data/floods", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateFlood: (id: string, body: Record<string, unknown>): Promise<FloodPoint> =>
    request<FloodPoint>(`/api/data/floods/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteFlood: (id: string): Promise<void> =>
    request<void>(`/api/data/floods/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // CRUD — Depots
  createDepot: (body: Omit<Depot, "id">): Promise<Depot> =>
    request<Depot>("/api/data/depo", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateDepot: (id: string, body: Record<string, unknown>): Promise<Depot> =>
    request<Depot>(`/api/data/depo/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteDepot: (id: string): Promise<void> =>
    request<void>(`/api/data/depo/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // CRUD — IF
  createIF: (body: Omit<IntermediateFacility, "id">): Promise<IntermediateFacility> =>
    request<IntermediateFacility>("/api/data/if", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateIF: (id: string, body: Record<string, unknown>): Promise<IntermediateFacility> =>
    request<IntermediateFacility>(`/api/data/if/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteIF: (id: string): Promise<void> =>
    request<void>(`/api/data/if/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // CRUD — Faskes
  createFaskes: (body: Omit<Faskes, "id">): Promise<Faskes> =>
    request<Faskes>("/api/data/faskes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateFaskes: (id: string, body: Record<string, unknown>): Promise<Faskes> =>
    request<Faskes>(`/api/data/faskes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteFaskes: (id: string): Promise<void> =>
    request<void>(`/api/data/faskes/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const DEFAULT_ACS_PARAMS: ACSParams = {
  iterations: 60,
  n_ants: 20,
  alpha: 1.0,
  beta: 3.0,
  rho: 0.10,
  q0: 0.90,
  seed: 42,
  time_limit_s: 45,
};

export const DEFAULT_VNS_PARAMS: VNSParams = {
  max_iterations: 100,
  k_max: 3,
  seed: 42,
  time_limit_s: 45,
};
