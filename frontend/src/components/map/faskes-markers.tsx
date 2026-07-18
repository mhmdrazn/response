"use client";

import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";

import type { Faskes } from "../../types";
import { PopupRow, PopupShell } from "./marker-popup";

const faskesIcon = L.divIcon({
  html: `
    <div style="
      width: 18px; height: 18px;
      background: #059669;
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

/** OSM healthcare/amenity tag → Indonesian label. Unknown values fall back
 *  to a Title-Cased raw value so the popup still reads cleanly for new tags. */
const HEALTHCARE_LABELS: Record<string, string> = {
  clinic: "Klinik",
  doctor: "Praktik Dokter",
  doctors: "Praktik Dokter",
  hospital: "Rumah Sakit",
  pharmacy: "Apotek",
  dentist: "Dokter Gigi",
  optometrist: "Optik",
  physiotherapist: "Fisioterapi",
  midwife: "Bidan",
  laboratory: "Laboratorium",
  alternative: "Pengobatan Alternatif",
  centre: "Pusat Kesehatan",
  yes: "Fasilitas Kesehatan",
};

function toTitleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function localizeHealthcare(v: string | null | undefined): string | null {
  if (!v) return null;
  const key = v.toLowerCase().trim();
  return HEALTHCARE_LABELS[key] ?? toTitleCase(v);
}

interface FaskesMarkersProps {
  faskes: Faskes[];
}

export function FaskesMarkers({ faskes }: FaskesMarkersProps) {
  return (
    <>
      {faskes.map((f) => (
        <Marker key={f.id} position={[f.lat, f.lon]} icon={faskesIcon}>
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            <PopupShell title={f.name ?? `Faskes ${f.id}`}>
              {f.street ? <PopupRow label="Alamat" value={f.street} /> : null}
              {f.healthcare ? (
                <PopupRow label="Jenis" value={localizeHealthcare(f.healthcare) ?? f.healthcare} />
              ) : f.amenity ? (
                <PopupRow label="Jenis" value={localizeHealthcare(f.amenity) ?? f.amenity} />
              ) : null}
            </PopupShell>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
