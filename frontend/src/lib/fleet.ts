import type { FleetDefaults } from "./api";
import type { Depot, DepotFleetIn } from "../types";

/** Used until the backend answers, and if it never does. Mirrors instance.py. */
export const FALLBACK_FLEET_DEFAULTS: FleetDefaults = {
  capacities_l: [3000, 5000],
  units_per_capacity: 1,
  operating_minutes: 281,
};

export const MAX_UNITS = 10;
export const MIN_TANK_L = 500;
export const MAX_TANK_L = 20000;
export const MIN_SHIFT_MIN = 30;
export const MAX_SHIFT_MIN = 720;

/** What one depot has been set to; a missing depot keeps the defaults. */
export interface DepotSetting {
  /** Units of the first and second tank size. */
  units: [number, number];
  /** Longest crew shift on one route, in minutes; null keeps the default. */
  minutes: number | null;
}

export interface FleetSettings {
  /** The two tank sizes (litres) every depot draws from. */
  tanks: [number, number];
  depots: Record<string, DepotSetting>;
}

export function defaultFleetSettings(defaults: FleetDefaults): FleetSettings {
  const [a, b] = defaults.capacities_l;
  return { tanks: [a ?? 3000, b ?? 5000], depots: {} };
}

export function settingFor(
  settings: FleetSettings,
  depotId: string,
  defaults: FleetDefaults,
): DepotSetting {
  return (
    settings.depots[depotId] ?? {
      units: [defaults.units_per_capacity, defaults.units_per_capacity],
      minutes: null,
    }
  );
}

function sameSetting(a: DepotSetting, b: DepotSetting): boolean {
  return a.units[0] === b.units[0] && a.units[1] === b.units[1] && a.minutes === b.minutes;
}

/** Depots whose setting differs from the defaults. */
export function changedDepotIds(
  settings: FleetSettings,
  depots: Depot[],
  defaults: FleetDefaults,
): string[] {
  const base = settingFor({ tanks: settings.tanks, depots: {} }, "", defaults);
  return depots.filter((d) => !sameSetting(settingFor(settings, d.id, defaults), base)).map((d) => d.id);
}

export function tanksChanged(settings: FleetSettings, defaults: FleetDefaults): boolean {
  const [a, b] = defaults.capacities_l;
  return settings.tanks[0] !== a || settings.tanks[1] !== b;
}

export function isCustomFleet(
  settings: FleetSettings,
  depots: Depot[],
  defaults: FleetDefaults,
): boolean {
  return tanksChanged(settings, defaults) || changedDepotIds(settings, depots, defaults).length > 0;
}

/** The fleet to send with a run, or null when everything is at its defaults. */
export function buildFleetPayload(
  settings: FleetSettings,
  depots: Depot[],
  defaults: FleetDefaults,
): DepotFleetIn[] | null {
  if (!isCustomFleet(settings, depots, defaults)) return null;
  return depots.map((d) => {
    const s = settingFor(settings, d.id, defaults);
    return {
      depot_id: d.id,
      units: [
        { capacity_l: settings.tanks[0], count: s.units[0] },
        { capacity_l: settings.tanks[1], count: s.units[1] },
      ],
      operating_minutes: s.minutes,
    };
  });
}

export interface FleetSummary {
  units: number;
  /** Litres the whole fleet can carry in one load. */
  loadL: number;
  activeDepots: number;
}

export function summarizeFleet(
  settings: FleetSettings,
  depots: Depot[],
  defaults: FleetDefaults,
): FleetSummary {
  let units = 0;
  let loadL = 0;
  let activeDepots = 0;
  for (const d of depots) {
    const s = settingFor(settings, d.id, defaults);
    const n = s.units[0] + s.units[1];
    units += n;
    loadL += s.units[0] * settings.tanks[0] + s.units[1] * settings.tanks[1];
    if (n > 0) activeDepots += 1;
  }
  return { units, loadL, activeDepots };
}

export interface FleetProblem {
  /** Depot the problem belongs to; null for the fleet as a whole. */
  depotId: string | null;
  message: string;
}

/** What stops these settings from being applied; empty when they are fine. */
export function validateFleet(
  settings: FleetSettings,
  depots: Depot[],
  defaults: FleetDefaults,
): FleetProblem[] {
  const problems: FleetProblem[] = [];
  settings.tanks.forEach((cap, i) => {
    if (!Number.isInteger(cap) || cap < MIN_TANK_L || cap > MAX_TANK_L) {
      problems.push({
        depotId: null,
        message: `Tangki ${i === 0 ? "A" : "B"}: isi ${MIN_TANK_L}-${MAX_TANK_L.toLocaleString("id-ID")} liter.`,
      });
    }
  });
  for (const d of depots) {
    const s = settingFor(settings, d.id, defaults);
    if (s.minutes !== null && (s.minutes < MIN_SHIFT_MIN || s.minutes > MAX_SHIFT_MIN)) {
      problems.push({
        depotId: d.id,
        message: `${d.name ?? d.id}: jam operasional ${MIN_SHIFT_MIN / 60}-${MAX_SHIFT_MIN / 60} jam.`,
      });
    }
  }
  if (depots.length > 0 && summarizeFleet(settings, depots, defaults).units === 0) {
    problems.push({ depotId: null, message: "Minimal satu unit kendaraan di salah satu depo." });
  }
  return problems;
}
