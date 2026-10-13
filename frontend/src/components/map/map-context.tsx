"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { createContext, useContext } from "react";

import type { AppLayout } from "../../types";
import type { ThreeD } from "./use-three-d";

export interface MapContextValue {
  map: MapLibreMap;
  /** Bumps every time a basemap style finishes loading; overlays re-add their layers on it. */
  styleVersion: number;
  threeD: ThreeD;
  /** Page layout and the switch between full map and dashboard, for the map's controls. */
  layout?: AppLayout;
  onToggleLayout?: () => void;
}

export const MapContext = createContext<MapContextValue | null>(null);

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used inside the map");
  return ctx;
}

export function useMap(): MapLibreMap {
  return useMapContext().map;
}

/** Layers of the clickable points; a tooltip of something beneath them stays hidden. */
export const POINT_HIT_LAYERS = [
  "app-floods-dot",
  "app-depot-icon",
  "app-if-icon",
  "app-faskes-icon",
];

/** Id of the first label layer of the basemap, so overlays can sit under the text. */
export function labelLayerId(map: MapLibreMap): string | undefined {
  return map.getStyle().layers.find((l) => l.type === "symbol")?.id;
}
