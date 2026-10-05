"use client";

import { Marker, Tooltip } from "react-leaflet";

import { FACILITY_COLORS } from "../../lib/map-constants";
import { selectableIcon } from "../../lib/marker-icon";
import { localizeHighway, localizeWaterway } from "../../lib/osm-labels";
import type { IntermediateFacility } from "../../types";
import { ClickHint, PopupRow, PopupShell } from "./marker-popup";

/** Blue square icon for a sungai/IF titik-buang-air point. */
const IF_GLYPH = `
  <div style="
    width: 20px; height: 20px;
    background: ${FACILITY_COLORS.if};
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #ffffff;
  ">
    <svg width="11" height="11" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M 8 2 C 5 6 3.5 8 3.5 10.5 A 4.5 4.5 0 0 0 12.5 10.5 C 12.5 8 11 6 8 2 Z" fill="#ffffff"/>
    </svg>
  </div>
`;

const ifIcons = {
  idle: selectableIcon(IF_GLYPH, 20, FACILITY_COLORS.if, false),
  selected: selectableIcon(IF_GLYPH, 20, FACILITY_COLORS.if, true),
};

interface IfMarkersProps {
  ifs: IntermediateFacility[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function IfMarkers({ ifs, selectedId, onSelect }: IfMarkersProps) {
  return (
    <>
      {ifs.map((f) => (
        <Marker
          key={f.id}
          position={[f.lat, f.lon]}
          icon={f.id === selectedId ? ifIcons.selected : ifIcons.idle}
          zIndexOffset={f.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect?.(f.id) }}
        >
          <Tooltip direction="top" offset={[0, -12]} opacity={1}>
            <PopupShell title={f.highway_name ?? `Titik Buang Air ${f.id}`}>
              {f.waterway_name ? <PopupRow label="Sungai" value={f.waterway_name} /> : null}
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
                <PopupRow label="Jarak ke air" value={`${f.distance_to_water_m.toFixed(1)} m`} />
              ) : null}
              <ClickHint />
            </PopupShell>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
