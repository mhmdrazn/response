"use client";

import { useEffect, useSyncExternalStore } from "react";

import { fetchTrafficTilesStatus, type TrafficTilesStatus } from "../lib/tomtom-traffic";

// One shared copy of the traffic proxy's status, so the layer dock and the map
// ask the server once instead of each on their own.

let status: TrafficTilesStatus | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Asks the server again (after a tile refresh, or when tiles start failing). */
export function refreshTrafficTilesStatus(): Promise<void> {
  if (!pending) {
    pending = fetchTrafficTilesStatus()
      .then((s) => {
        status = s;
      })
      .catch(() => {
        status = status ?? {
          configured: false,
          day_count: 0,
          day_limit: 0,
          month_count: 0,
          month_limit: 0,
          limited: false,
        };
      })
      .finally(() => {
        pending = null;
        listeners.forEach((l) => l());
      });
  }
  return pending;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** The proxy's status; null until the first answer. */
export function useTrafficTilesStatus(): TrafficTilesStatus | null {
  const value = useSyncExternalStore(
    subscribe,
    () => status,
    () => null,
  );
  useEffect(() => {
    if (status === null) void refreshTrafficTilesStatus();
  }, []);
  return value;
}
