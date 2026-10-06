"use client";

import { useEffect } from "react";
import { useMapEvents } from "react-leaflet";

interface PickLayerProps {
  active: boolean;
  onPick: (lat: number, lon: number) => void;
}

/** While active, a click on the bare map picks a location and the cursor becomes a crosshair. */
export function PickLayer({ active, onPick }: PickLayerProps) {
  const map = useMapEvents({
    click(e) {
      if (active) onPick(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    const el = map.getContainer();
    el.classList.toggle("map-picking", active);
    return () => el.classList.remove("map-picking");
  }, [active, map]);

  return null;
}
