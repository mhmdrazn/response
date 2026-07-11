"use client";

import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";

import type { Faskes } from "../../types";
import { PopupRow, PopupShell } from "./marker-popup";

const faskesIcon = L.divIcon({
  html: `
    <div style="
      width: 18px; height: 18px;
      background: #0891b2;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #ffffff;
    ">
      <svg width="10" height="10" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M 6.5 3 h 3 v 3 h 3 v 3 h -3 v 3 h -3 v -3 h -3 v -3 h 3 z" fill="#ffffff"/>
      </svg>
    </div>
  `,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

interface FaskesMarkersProps {
  faskes: Faskes[];
}

export function FaskesMarkers({ faskes }: FaskesMarkersProps) {
  return (
    <>
      {faskes.map((f) => (
        <Marker key={f.id} position={[f.lat, f.lon]} icon={faskesIcon}>
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            <PopupShell
              title={f.name ?? `Faskes ${f.id}`}
              subtitle={f.amenity ?? f.healthcare ?? undefined}
            >
              {f.street ? <PopupRow label="Alamat" value={f.street} /> : null}
              {f.healthcare ? (
                <PopupRow label="Jenis" value={f.healthcare} />
              ) : null}
            </PopupShell>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
