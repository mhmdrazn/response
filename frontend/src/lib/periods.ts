import type { OptimizationResult } from "../types";

/** Litres still open per flood id after a period; null when everything got pumped. */
export function carryOverVolumes(result: OptimizationResult | undefined): Record<string, number> | null {
  if (!result) return null;
  const open = result.unserved.filter((u) => u.remaining_l >= 1);
  if (open.length === 0) return null;
  return Object.fromEntries(open.map((u) => [u.flood_id, u.remaining_l]));
}

export interface PeriodRow {
  index: number;
  /** Seconds from the first crew leaving to this period's crews leaving. */
  startS: number;
  /** Seconds when this period's last crew is home again. */
  endS: number;
  /** Litres this period had to pump: the original work, or the last period's leftovers. */
  carriedInL: number;
  pumpedL: number;
  carriedOutL: number;
  /** Share of this period's own work that got pumped. */
  periodCoveragePct: number;
  /** Share of the original work pumped by the end of this period. */
  cumulativeCoveragePct: number;
  /** Points that started this period with work and finished it. */
  completedPoints: number;
  /** Points still open at the end. */
  openPoints: number;
  vehicles: number;
  z: number;
}

/** What each period did, laid end to end: the next one starts when the last crew is back. */
export function buildTimeline(periods: OptimizationResult[]): PeriodRow[] {
  if (periods.length === 0) return [];
  const original = periods[0].demand_total_l;

  let cursor = 0;
  return periods.map((p, index) => {
    const makespan = p.balance?.makespan_s ?? Math.max(0, ...p.routes.map((r) => r.total_time_s));
    const carriedIn = p.demand_total_l;
    const pumped = Math.max(0, carriedIn - p.unserved_volume_l);

    // Period 1 has no earlier list of open points, so count what it visited or left.
    const touched = new Set<string>(p.unserved.map((u) => u.flood_id));
    if (index === 0) {
      for (const r of p.routes)
        for (const v of r.visits) if (v.node_type === "flood" && v.volume_pumped_l > 0) touched.add(v.node_id);
    }
    const pointsIn = index === 0 ? touched.size : periods[index - 1].unserved.length;

    const row: PeriodRow = {
      index,
      startS: cursor,
      endS: cursor + makespan,
      carriedInL: carriedIn,
      pumpedL: pumped,
      carriedOutL: p.unserved_volume_l,
      periodCoveragePct: carriedIn > 0 ? (pumped / carriedIn) * 100 : 100,
      cumulativeCoveragePct: original > 0 ? Math.min(100, (1 - p.unserved_volume_l / original) * 100) : 100,
      completedPoints: Math.max(0, pointsIn - p.unserved.length),
      openPoints: p.unserved.length,
      vehicles: p.n_vehicles,
      z: p.objective_z,
    };
    cursor += makespan;
    return row;
  });
}

/**
 * Fill in what a result saved before these fields existed lacks, so an old save
 * in the browser opens instead of crashing. Re-running the optimisation replaces it.
 */
export function normalizeResult(r: OptimizationResult): OptimizationResult {
  return {
    ...r,
    unserved: r.unserved ?? [],
    suggestions: r.suggestions ?? [],
    balance: r.balance ?? null,
    routes: r.routes.map((route) => ({
      ...route,
      shift_limit_s: route.shift_limit_s ?? 0,
      pumped_l:
        route.pumped_l ??
        route.visits.reduce((s, v) => s + (v.node_type === "flood" ? v.volume_pumped_l : 0), 0),
    })),
  };
}
