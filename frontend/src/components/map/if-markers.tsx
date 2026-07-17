"use client";

import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";

import type { IntermediateFacility } from "../../types";
import { PopupRow, PopupShell } from "./marker-popup";

/** Blue square icon for a sungai/IF titik-buang-air point. */
const ifIcon = L.divIcon({
  html: `
    <div style="
      width: 20px; height: 20px;
      background: #0284c7;
      border-radius: 6px;
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

/** OSM highway class → Indonesian road class label. Falls back to a
 *  Title-Cased raw value when the class isn't in this table (so freshly
 *  scraped OSM data with unfamiliar tags still reads cleanly). */
const HIGHWAY_LABELS: Record<string, string> = {
  motorway: "Tol",
  motorway_link: "Rampa Tol",
  trunk: "Arteri Primer",
  trunk_link: "Rampa Arteri Primer",
  primary: "Arteri",
  primary_link: "Rampa Arteri",
  secondary: "Kolektor",
  secondary_link: "Rampa Kolektor",
  tertiary: "Lokal",
  tertiary_link: "Rampa Lokal",
  unclassified: "Tidak Terklasifikasi",
  residential: "Perumahan",
  service: "Jalan Layanan",
  living_street: "Jalan Perumahan",
  pedestrian: "Pejalan Kaki",
  track: "Jalan Tanah",
};

/** OSM waterway type → Indonesian. */
const WATERWAY_LABELS: Record<string, string> = {
  river: "Sungai",
  stream: "Kali",
  canal: "Kanal",
  drain: "Drainase",
  ditch: "Parit",
  brook: "Anak Sungai",
};

function toTitleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function localizeHighway(type: string | null | undefined): string | null {
  if (!type) return null;
  const key = type.toLowerCase().trim();
  return HIGHWAY_LABELS[key] ?? toTitleCase(type);
}

function localizeWaterway(type: string | null | undefined): string | null {
  if (!type) return null;
  const key = type.toLowerCase().trim();
  return WATERWAY_LABELS[key] ?? toTitleCase(type);
}

interface IfMarkersProps {
  ifs: IntermediateFacility[];
}

export function IfMarkers({ ifs }: IfMarkersProps) {
  return (
    <>
      {ifs.map((f) => (
        <Marker key={f.id} position={[f.lat, f.lon]} icon={ifIcon}>
          <Tooltip direction="top" offset={[0, -12]} opacity={1}>
            <PopupShell title={f.highway_name ?? `Titik Buang Air ${f.id}`}>
              {f.waterway_name ? (
                <PopupRow label="Sungai" value={f.waterway_name} />
              ) : null}
              {f.waterway_type ? (
                <PopupRow
                  label="Tipe air"
                  value={localizeWaterway(f.waterway_type) ?? f.waterway_type}
                />
              ) : null}
              {f.highway_type ? (
                <PopupRow
                  label="Kelas jalan"
                  value={localizeHighway(f.highway_type) ?? f.highway_type}
                />
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
