"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type FleetDefaults } from "../lib/api";
import {
  FALLBACK_FLEET_DEFAULTS,
  buildFleetPayload,
  defaultFleetSettings,
  isCustomFleet,
  summarizeFleet,
  type FleetSettings,
  type FleetSummary,
} from "../lib/fleet";
import type { Depot, DepotFleetIn } from "../types";
import { usePersistentState } from "./use-persistent-state";

const STORAGE_KEY = "floodroute:fleet:v1";

export interface UseFleetConfig {
  settings: FleetSettings;
  defaults: FleetDefaults;
  setSettings: (next: FleetSettings) => void;
  reset: () => void;
  /** True when the fleet differs from the defaults in any way. */
  custom: boolean;
  summary: FleetSummary;
  /** The fleet to send with a run; null when it is all defaults. */
  payload: DepotFleetIn[] | null;
}

export function useFleetConfig(depots: Depot[]): UseFleetConfig {
  const [defaults, setDefaults] = useState<FleetDefaults>(FALLBACK_FLEET_DEFAULTS);
  const fallback = useMemo(() => defaultFleetSettings(defaults), [defaults]);
  const [stored, setStored] = usePersistentState<FleetSettings | null>(STORAGE_KEY, null);

  useEffect(() => {
    let alive = true;
    api
      .getFleetDefaults()
      .then((d) => {
        if (alive) setDefaults(d);
      })
      .catch(() => {
        /* the fallback mirrors the backend's own constants */
      });
    return () => {
      alive = false;
    };
  }, []);

  const settings = stored ?? fallback;

  const setSettings = useCallback((next: FleetSettings) => setStored(next), [setStored]);
  const reset = useCallback(() => setStored(null), [setStored]);

  return {
    settings,
    defaults,
    setSettings,
    reset,
    custom: isCustomFleet(settings, depots, defaults),
    summary: summarizeFleet(settings, depots, defaults),
    payload: buildFleetPayload(settings, depots, defaults),
  };
}
