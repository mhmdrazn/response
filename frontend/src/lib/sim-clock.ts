"use client";

import { useSyncExternalStore } from "react";

// One clock for the route simulation, outside React, so re-renders (a hover, a
// pan) never restart it, and the map and the visit timeline read the same time.

/** Simulated seconds per real second: a 4-hour route plays in about 4 minutes. */
export const SIM_SPEED = 60;
/** Pause between cycles, in simulated seconds (2 s real). */
const CYCLE_PAUSE_SIM_S = 2 * SIM_SPEED;
/** How often the timeline is told the time moved, in ms; the map reads it per frame. */
const TICK_MS = 250;

let startedAt: number | null = null;
let cycleSimS = 1;
let snapshot: number | null = null;
let timer: number | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = simNow();
  listeners.forEach((l) => l());
}

/** Seconds since departure in the simulation, or null while it is not running. */
export function simNow(): number | null {
  if (startedAt === null) return null;
  const elapsed = ((performance.now() - startedAt) / 1000) * SIM_SPEED;
  return elapsed % cycleSimS;
}

/** Starts the clock at departure; `longestRouteS` sets when it starts over. */
export function startSim(longestRouteS: number): void {
  cycleSimS = Math.max(1, longestRouteS) + CYCLE_PAUSE_SIM_S;
  startedAt = performance.now();
  window.clearInterval(timer);
  timer = window.setInterval(emit, TICK_MS);
  emit();
}

export function stopSim(): void {
  startedAt = null;
  window.clearInterval(timer);
  timer = undefined;
  emit();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** The simulation time for a component, refreshed a few times a second. */
export function useSimTime(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
}
