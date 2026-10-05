import type { OptimizationResult } from "../types";

export interface DepotFleetRow {
  vehicleId: string;
  colorIndex: number;
  capacityL: number;
  floodVisits: number;
  ifVisits: number;
  totalTimeS: number;
  distanceM: number;
  pumpedL: number;
}

export interface DepotActivity {
  fleet: DepotFleetRow[];
  floodCount: number;
  pumpedL: number;
  longestS: number;
  distanceM: number;
}

/** What the current plan does with the vehicles of one depot. */
export function summarizeDepot(result: OptimizationResult | null, depotId: string): DepotActivity {
  const fleet: DepotFleetRow[] = [];
  const floods = new Set<string>();
  for (const r of result?.routes ?? []) {
    if (r.depot_id !== depotId) continue;
    let pumpedL = 0;
    for (const v of r.visits) {
      if (v.node_type !== "flood") continue;
      pumpedL += v.volume_pumped_l;
      if (v.volume_pumped_l > 0) floods.add(v.node_id);
    }
    fleet.push({
      vehicleId: r.vehicle_id,
      colorIndex: r.route_color_index,
      capacityL: r.capacity_l,
      floodVisits: r.visit_count_flood,
      ifVisits: r.visit_count_if,
      totalTimeS: r.total_time_s,
      distanceM: r.total_distance_m,
      pumpedL,
    });
  }
  return {
    fleet,
    floodCount: floods.size,
    pumpedL: fleet.reduce((s, f) => s + f.pumpedL, 0),
    longestS: fleet.reduce((m, f) => Math.max(m, f.totalTimeS), 0),
    distanceM: fleet.reduce((s, f) => s + f.distanceM, 0),
  };
}

export interface IfDischarge {
  vehicleId: string;
  depotName: string;
  colorIndex: number;
  /** Seconds after the fleet leaves its depots. */
  arrivalS: number;
  dischargedL: number;
}

export interface IfActivity {
  discharges: IfDischarge[];
  dischargedL: number;
  vehicleCount: number;
}

/** Every time a plan empties a tank at one intermediate facility, earliest first. */
export function summarizeIf(result: OptimizationResult | null, ifId: string): IfActivity {
  const discharges: IfDischarge[] = [];
  for (const r of result?.routes ?? []) {
    r.visits.forEach((v, i) => {
      if (v.node_type !== "if" || v.node_id !== ifId) return;
      // The tank is emptied here, so what was poured out is the load on arrival.
      const dischargedL = i > 0 ? r.visits[i - 1].tank_load_after_l : r.capacity_l;
      discharges.push({
        vehicleId: r.vehicle_id,
        depotName: r.depot_name,
        colorIndex: r.route_color_index,
        arrivalS: v.arrival_time_s,
        dischargedL,
      });
    });
  }
  discharges.sort((a, b) => a.arrivalS - b.arrivalS);
  return {
    discharges,
    dischargedL: discharges.reduce((s, d) => s + d.dischargedL, 0),
    vehicleCount: new Set(discharges.map((d) => d.vehicleId)).size,
  };
}
