import type { OptimizationResult } from "../types";

export interface FloodVisit {
  vehicleId: string;
  depotName: string;
  capacityL: number;
  colorIndex: number;
  /** Seconds after the fleet leaves its depots. */
  arrivalS: number;
  pumpedL: number;
}

export type FloodServiceStatus = "no-plan" | "none" | "partial" | "done";

export interface FloodService {
  visits: FloodVisit[];
  pumpedL: number;
  /** Litres still to pump; null when the point has no volume estimate. */
  remainingL: number | null;
  /** Share of the estimated volume pumped, 0-100; null without an estimate. */
  coveragePct: number | null;
  vehicleCount: number;
  status: FloodServiceStatus;
}

/** Every visit a plan makes to one flood point, earliest first. */
export function collectFloodVisits(
  result: OptimizationResult | null,
  floodId: string,
): FloodVisit[] {
  if (!result) return [];
  const out: FloodVisit[] = [];
  for (const r of result.routes) {
    for (const v of r.visits) {
      if (v.node_type !== "flood" || v.node_id !== floodId) continue;
      out.push({
        vehicleId: r.vehicle_id,
        depotName: r.depot_name,
        capacityL: r.capacity_l,
        colorIndex: r.route_color_index,
        arrivalS: v.arrival_time_s,
        pumpedL: v.volume_pumped_l,
      });
    }
  }
  return out.sort((a, b) => a.arrivalS - b.arrivalS);
}

export function summarizeFloodService(
  result: OptimizationResult | null,
  floodId: string,
  volumeL: number | null | undefined,
): FloodService {
  const visits = collectFloodVisits(result, floodId);
  const pumpedL = visits.reduce((sum, v) => sum + v.pumpedL, 0);
  const hasVolume = volumeL != null && volumeL > 0;
  const remainingL = hasVolume ? Math.max(volumeL - pumpedL, 0) : null;
  const coveragePct = hasVolume ? Math.min((pumpedL / volumeL) * 100, 100) : null;

  let status: FloodServiceStatus;
  if (!result) status = "no-plan";
  else if (pumpedL <= 0) status = "none";
  else if (remainingL !== null && remainingL > 1) status = "partial";
  else status = "done";

  return {
    visits,
    pumpedL,
    remainingL,
    coveragePct,
    vehicleCount: new Set(visits.map((v) => v.vehicleId)).size,
    status,
  };
}
