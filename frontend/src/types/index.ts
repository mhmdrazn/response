// Domain and API types for Response.
// These shapes mirror the Pydantic models in backend/app/models/.

// ---------- Node datasets ----------

export interface FloodPoint {
  id: string;
  lat: number;
  lon: number;
  datetime: string | null;
  deskripsi: string | null;
  ketinggian_cm: number | null;
  si_value?: number;
}

export interface Depot {
  id: string;
  osm_id: number;
  lat: number;
  lon: number;
  name: string | null;
  city: string | null;
  type: string | null;
}

export interface IntermediateFacility {
  id: string;
  lat: number;
  lon: number;
  waterway_name: string | null;
  waterway_type: string | null;
  highway_name: string | null;
  highway_type: string | null;
  distance_to_water_m: number | null;
  n_source_points: number | null;
}

export interface Faskes {
  id: string;
  osm_id: number;
  lat: number;
  lon: number;
  name: string | null;
  amenity: string | null;
  street: string | null;
  healthcare: string | null;
  type: string | null;
}

// ---------- Optimization types (match backend/app/models/optimization.py) ----------

export type NodeType = "depot" | "flood" | "if";

export interface VisitOut {
  node_id: string;
  node_name: string;
  node_type: NodeType;
  lat: number;
  lon: number;
  arrival_time_s: number;
  tank_load_after_l: number;
  volume_pumped_l: number;
}

export interface RouteOut {
  vehicle_id: string;
  depot_id: string;
  depot_name: string;
  capacity_l: number;
  route_color_index: number;
  total_distance_m: number;
  total_time_s: number;
  z_contribution: number;
  visit_count_flood: number;
  visit_count_if: number;
  polyline: [number, number][];
  visits: VisitOut[];
}

export interface ConvergencePoint {
  iteration: number;
  best_z: number;
  iter_best_z: number;
}

export interface OptimizationResult {
  algorithm: "acs" | "vns";
  routes: RouteOut[];
  objective_z: number;
  penalty: number;
  score: number;
  demand_total_l: number;
  unserved_volume_l: number;
  coverage_pct: number;
  unserved_points: number;
  total_distance_m: number;
  total_time_s: number;
  total_if_visits: number;
  total_flood_visits: number;
  total_revisits: number;
  computation_time_s: number;
  convergence: ConvergencePoint[];
  n_vehicles: number;
}

export interface ACSParams {
  iterations: number;
  n_ants: number;
  alpha: number;
  beta: number;
  rho: number;
  q0: number;
  seed?: number | null;
  time_limit_s?: number | null;
}

export interface VNSParams {
  max_iterations: number;
  k_max: number;
  seed?: number | null;
  time_limit_s?: number | null;
}

// ---------- Severity Index (matches backend/app/models/severity.py) ----------

export interface SeverityWeights {
  criteria: string[];
  ahp: number[];
  ew: number[];
  combined: number[];
  consistency_ratio: number;
}

export interface SeverityFloodPoint {
  id: string;
  si_value: number;
  depth_cm: number;
  road_class: number;
  dist_faskes_m: number;
}

export interface SeverityIndexResponse {
  weights: SeverityWeights;
  flood_points: SeverityFloodPoint[];
}

// ---------- Comparison ----------

export interface ComparisonResult {
  acs: OptimizationResult;
  vns: OptimizationResult;
}

// ---------- Data freshness (matches /api/data/meta) ----------

export interface DataMetaEntry {
  updated_at: string | null;
  rows: number;
}

export type DataMetaResponse = Record<"floods" | "depo" | "if" | "faskes", DataMetaEntry>;

// ---------- Scenarios (matches /api/scenarios) ----------

export interface ScenarioMeta {
  id: string;
  name: string;
  date_from?: string | null;
  date_to?: string | null;
  n_points?: number | null;
  description?: string | null;
}

export interface ScenarioList {
  default: string;
  scenarios: ScenarioMeta[];
}

// ---------- App modes ----------

export type AppMode = "simple" | "advanced";

/** Overall page layout: "fullscreen" map with floating panels, or a "windowed"
 *  dashboard (header + sidebar + map card + results column). */
export type AppLayout = "fullscreen" | "windowed";
