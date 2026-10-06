"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker } from "react-leaflet";

interface DraftMarkerProps {
  lat: number;
  lon: number;
  onMove: (lat: number, lon: number) => void;
}

/** A pin for the point being added; it can be dragged to fine-tune the spot. */
export function DraftMarker({ lat, lon, onMove }: DraftMarkerProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        iconSize: [30, 40],
        iconAnchor: [15, 38],
        html: `
          <div class="soft-pop" style="position:relative;width:30px;height:40px;">
            <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 1C7.3 1 1 7.2 1 14.8c0 10.2 14 24.2 14 24.2s14-14 14-24.2C29 7.2 22.7 1 15 1z"
                    fill="var(--color-indigo-ink)" stroke="#ffffff" stroke-width="2"/>
              <circle cx="15" cy="15" r="5.2" fill="#ffffff"/>
            </svg>
          </div>`,
      }),
    [],
  );

  return (
    <Marker
      position={[lat, lon]}
      icon={icon}
      draggable
      zIndexOffset={2000}
      eventHandlers={{
        dragend(e) {
          const p = (e.target as L.Marker).getLatLng();
          onMove(p.lat, p.lng);
        },
      }}
    />
  );
}
