"use client";

import type { MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { hitsLayers } from "./hover-tooltip";
import { POINT_HIT_LAYERS, useMap } from "./map-context";

interface PickLayerProps {
  active: boolean;
  onPick: (lat: number, lon: number) => void;
}

/** While active, a click on the bare map picks a location and the cursor becomes a crosshair. */
export function PickLayer({ active, onPick }: PickLayerProps) {
  const map = useMap();
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  });

  useEffect(() => {
    if (!active) return;
    const el = map.getContainer();
    el.classList.add("map-picking");
    const click = (e: MapMouseEvent) => {
      // A click on a point is about that point, not a spot for the new one.
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest(".maplibregl-marker")) return;
      if (hitsLayers(map, e.point.x, e.point.y, POINT_HIT_LAYERS)) return;
      pickRef.current(e.lngLat.lat, e.lngLat.lng);
    };
    map.on("click", click);
    return () => {
      el.classList.remove("map-picking");
      map.off("click", click);
    };
  }, [active, map]);

  return null;
}
