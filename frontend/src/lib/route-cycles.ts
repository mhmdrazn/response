import type { RouteOut } from "../types";

/**
 * A pumping route is a chain of fill-and-empty cycles: pour out at an outlet,
 * drive to a flood point, fill the tank, and go back to an outlet. The same two
 * places can repeat dozens of times, which reads as noise without a count.
 *
 * A cycle is the outlet stop(s) before a flood stop plus that flood stop. Outlet
 * stops after the last flood belong to no cycle: they are the final pour-out.
 */
export interface StopCycle {
  /** 1-based cycle this stop belongs to; null for depot stops and the final pour-out. */
  cycle: number | null;
  /** True for the outlet stops that close the route after its last flood stop. */
  final: boolean;
  /** True on the first stop of a cycle (or of the final pour-out). */
  starts: boolean;
}

export interface RouteCycles {
  /** One entry per visit, in route order. */
  stops: StopCycle[];
  /** Number of cycles on the route. */
  total: number;
}

export function labelCycles(route: RouteOut): RouteCycles {
  const total = route.visits.filter((v) => v.node_type === "flood").length;

  let floodsSeen = 0;
  let lastKey: string | null = null;
  const stops = route.visits.map((v): StopCycle => {
    if (v.node_type === "depot") return { cycle: null, final: false, starts: false };

    // An outlet stop belongs to the cycle of the flood stop that follows it.
    const cycle = floodsSeen + 1;
    if (v.node_type === "flood") floodsSeen += 1;

    const final = cycle > total;
    const key = final ? "final" : String(cycle);
    const starts = key !== lastKey;
    lastKey = key;
    return { cycle: final ? null : cycle, final, starts };
  });

  return { stops, total };
}

/** "3/25", or "Akhir" for the closing pour-out, or "" for depot stops. */
export function cycleShort(stop: StopCycle, total: number): string {
  if (stop.final) return "Akhir";
  return stop.cycle === null ? "" : `${stop.cycle}/${total}`;
}
