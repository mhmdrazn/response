"use client";

import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";

import type { IntermediateFacility } from "../../types";
import { PopupRow, PopupShell } from "./marker-popup";

const ifIcon = L.divIcon({
  html: `
    <div style="
      width: 20px; height: 20px;
      background: var(--color-steel);
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #ffffff;
    ">
      <svg width="11" height="11" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M 8 2 C 5 6 3.5 8 3.5 10.5 A 4.5 4.5 0 0 0 12.5 10.5 C 12.5 8 11 6 8 2 Z" fill="#ffffff"/>
      </svg>
    </div>
  `,
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

interface IfMarkersProps {
  ifs: IntermediateFacility[];
}

export function IfMarkers({ ifs }: IfMarkersProps) {
  return (
    <>
      {ifs.map((f) => (
        <Marker key={f.id} position={[f.lat, f.lon]} icon={ifIcon}>
          <Tooltip direction="top" offset={[0, -12]} opacity={1}>
            <PopupShell
              title={f.highway_name ?? `Titik Buang Air ${f.id}`}
              subtitle={f.waterway_name ?? f.waterway_type ?? undefined}
            >
              {f.waterway_name ? (
                <PopupRow label="Sungai" value={f.waterway_name} />
              ) : null}
              {f.waterway_type ? (
                <PopupRow label="Tipe air" value={f.waterway_type} />
              ) : null}
              {f.highway_type ? (
                <PopupRow label="Kelas jalan" value={f.highway_type} />
              ) : null}
              {f.distance_to_water_m != null ? (
                <PopupRow
                  label="Jarak ke air"
                  value={`${f.distance_to_water_m.toFixed(1)} m`}
                />
              ) : null}
            </PopupShell>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
