import type { RouteOut, VisitOut } from "../types";

// When a vehicle is where, from the visit log. The backend logs each stop's
// `arrival_time_s` once its service is done (pumping, draining), so the arrival
// itself is that time less the service. The simulation on the map and the
// visit timeline both read this, so they always agree.

/** Litres per second the pump moves (2000 L/min), as in the backend. */
const PUMP_RATE_LPS = 2000 / 60;
/** Fixed time to set up the pump at a flood point, in seconds. */
const SERVICE_SETUP_S = 60;
/** Typical time to empty the tank at an outlet; the log does not carry it per stop. */
const OUTLET_DRAIN_S = 120;

export interface StopTiming {
  /** Seconds after departure the vehicle reaches the stop. */
  arrive: number;
  /** Seconds after departure it leaves (its service done). */
  depart: number;
}

function serviceSeconds(v: VisitOut): number {
  if (v.node_type === "flood") {
    return v.volume_pumped_l > 0 ? SERVICE_SETUP_S + v.volume_pumped_l / PUMP_RATE_LPS : 0;
  }
  return v.node_type === "if" ? OUTLET_DRAIN_S : 0;
}

const cache = new WeakMap<RouteOut, StopTiming[]>();

export function stopTimings(route: RouteOut): StopTiming[] {
  const hit = cache.get(route);
  if (hit) return hit;
  const out: StopTiming[] = [];
  route.visits.forEach((v, i) => {
    const depart = v.arrival_time_s;
    const prev = i > 0 ? out[i - 1].depart : 0;
    out.push({ arrive: Math.max(prev, depart - serviceSeconds(v)), depart });
  });
  cache.set(route, out);
  return out;
}

export type RoutePhase =
  /** At stop `index`, being served. */
  | { kind: "stop"; index: number }
  /** Driving from stop `index` to `index + 1`; `frac` of the leg is done. */
  | { kind: "travel"; index: number; frac: number }
  /** Back at the depot, the route finished. */
  | { kind: "done" };

/** Where the vehicle is `t` seconds after leaving the depot. */
export function routePhase(route: RouteOut, t: number): RoutePhase {
  const timing = stopTimings(route);
  const n = timing.length;
  if (n === 0 || t >= timing[n - 1].depart) return { kind: "done" };
  for (let i = 0; i < n; i++) {
    if (t < timing[i].arrive) {
      const from = timing[i - 1]?.depart ?? 0;
      const span = timing[i].arrive - from;
      return { kind: "travel", index: i - 1, frac: span > 0 ? (t - from) / span : 1 };
    }
    if (t < timing[i].depart) return { kind: "stop", index: i };
  }
  return { kind: "done" };
}

/** Seconds the whole route takes, depot to depot. */
export function routeDuration(route: RouteOut): number {
  const timing = stopTimings(route);
  return timing.length ? timing[timing.length - 1].depart : route.total_time_s;
}
