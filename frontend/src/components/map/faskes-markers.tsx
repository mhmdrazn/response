"use client";

import { Marker, Tooltip } from "react-leaflet";

import { FACILITY_COLORS } from "../../lib/map-constants";
import { selectableIcon } from "../../lib/marker-icon";
import { localizeHealthcare } from "../../lib/osm-labels";
import type { Faskes } from "../../types";
import { ClickHint, PopupRow, PopupShell } from "./marker-popup";

const FASKES_GLYPH = `
  <div style="
    width: 18px; height: 18px;
    background: ${FACILITY_COLORS.faskes};
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #ffffff;
  ">
    <svg width="10" height="10" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M 6.5 3 h 3 v 3 h 3 v 3 h -3 v 3 h -3 v -3 h -3 v -3 h 3 z" fill="#ffffff"/>
    </svg>
  </div>
`;

const faskesIcons = {
  idle: selectableIcon(FASKES_GLYPH, 18, FACILITY_COLORS.faskes, false),
  selected: selectableIcon(FASKES_GLYPH, 18, FACILITY_COLORS.faskes, true),
};

interface FaskesMarkersProps {
  faskes: Faskes[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function FaskesMarkers({ faskes, selectedId, onSelect }: FaskesMarkersProps) {
  return (
    <>
      {faskes.map((f) => (
        <Marker
          key={f.id}
          position={[f.lat, f.lon]}
          icon={f.id === selectedId ? faskesIcons.selected : faskesIcons.idle}
          zIndexOffset={f.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect?.(f.id) }}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            <PopupShell title={f.name ?? `Faskes ${f.id}`}>
              {f.street ? <PopupRow label="Alamat" value={f.street} /> : null}
              {f.healthcare ? (
                <PopupRow label="Jenis" value={localizeHealthcare(f.healthcare) ?? f.healthcare} />
              ) : f.amenity ? (
                <PopupRow label="Jenis" value={localizeHealthcare(f.amenity) ?? f.amenity} />
              ) : null}
              <ClickHint />
            </PopupShell>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
