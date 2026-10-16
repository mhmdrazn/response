"use client";

import { useSyncExternalStore } from "react";

// One clock for the route simulation, outside React, so re-renders (a hover, a
// pan) never restart it, and the map and the visit timeline read the same time.

/** Simulated seconds per real second the user can pick from. */
export const SIM_SPEEDS = [30, 60, 120, 300] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];
/** Default: a 4-hour route plays in about 4 minutes. */
export const DEFAULT_SIM_SPEED: SimSpeed = 60;
/** Pause between cycles, in real seconds. */
const CYCLE_PAUSE_REAL_S = 2;
/** How often the timeline is told the time moved, in ms; the map reads it per frame. */
const TICK_MS = 250;

let speed: SimSpeed = DEFAULT_SIM_SPEED;
let longestS = 1;
let cycleSimS = 1;
// The clock runs from an anchor: simulated time `anchorSim` at real time `anchorReal`.
// A speed change re-anchors at the current time, so the vehicles carry on from
// where they are instead of jumping.
let anchorReal: number | null = null;
let anchorSim = 0;
let snapshot: number | null = null;
let timer: number | undefined;
const listeners = new Set<() => void>();
const speedListeners = new Set<() => void>();

function emit(): void {
  snapshot = simNow();
  listeners.forEach((l) => l());
}

function cycleFor(s: number): number {
  return Math.max(1, longestS) + CYCLE_PAUSE_REAL_S * s;
}

/** Seconds since departure in the simulation, or null while it is not running. */
export function simNow(): number | null {
  if (anchorReal === null) return null;
  const elapsed = anchorSim + ((performance.now() - anchorReal) / 1000) * speed;
  return elapsed % cycleSimS;
}

/** Starts the clock at departure; `longestRouteS` sets when it starts over. */
export function startSim(longestRouteS: number): void {
  longestS = longestRouteS;
  cycleSimS = cycleFor(speed);
  anchorSim = 0;
  anchorReal = performance.now();
  window.clearInterval(timer);
  timer = window.setInterval(emit, TICK_MS);
  emit();
}

export function stopSim(): void {
  anchorReal = null;
  window.clearInterval(timer);
  timer = undefined;
  emit();
}

export function getSimSpeed(): SimSpeed {
  return speed;
}

/** Changes the playback speed, carrying on from the current simulated time. */
export function setSimSpeed(next: SimSpeed): void {
  if (next === speed) return;
  const now = simNow();
  speed = next;
  if (now !== null) {
    cycleSimS = cycleFor(next);
    anchorSim = now % cycleSimS;
    anchorReal = performance.now();
    emit();
  }
  speedListeners.forEach((l) => l());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function subscribeSpeed(onChange: () => void): () => void {
  speedListeners.add(onChange);
  return () => speedListeners.delete(onChange);
}

/** The simulation time for a component, refreshed a few times a second. */
export function useSimTime(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
}

/** The current playback speed. */
export function useSimSpeed(): SimSpeed {
  return useSyncExternalStore(subscribeSpeed, getSimSpeed, () => DEFAULT_SIM_SPEED);
}
