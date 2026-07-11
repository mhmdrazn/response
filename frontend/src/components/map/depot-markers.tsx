"use client";

import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";

import type { Depot } from "../../types";
import { PopupRow, PopupShell } from "./marker-popup";

const depotIcon = L.divIcon({
  html: `
    <div style="
      width: 22px; height: 22px;
      background: var(--color-indigo-ink);
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #ffffff;
    ">
      <svg width="12" height="12" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M 8 2 C 6 5 4 6.5 4 9 a 4 4 0 0 0 8 0 C 12 6.5 10 5 8 2 Z" fill="#ffffff"/>
      </svg>
    </div>
  `,
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

interface DepotMarkersProps {
  depots: Depot[];
}

export function DepotMarkers({ depots }: DepotMarkersProps) {
  return (
    <>
      {depots.map((d) => (
        <Marker key={d.id} position={[d.lat, d.lon]} icon={depotIcon}>
          <Tooltip direction="top" offset={[0, -14]} opacity={1}>
            <PopupShell
              title={d.name ?? `Depo ${d.id}`}
              subtitle={d.city ?? "Kota Surabaya"}
            >
              <PopupRow label="Tipe" value={d.type ?? "—"} />
            </PopupShell>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
