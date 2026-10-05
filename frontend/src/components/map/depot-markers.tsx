"use client";

import { Marker, Tooltip } from "react-leaflet";

import { FACILITY_COLORS } from "../../lib/map-constants";
import { selectableIcon } from "../../lib/marker-icon";
import type { Depot } from "../../types";
import { ClickHint, PopupRow, PopupShell } from "./marker-popup";

/** Small fire-station silhouette: rectangular building with a pitched roof
 *  and a garage door — visually closer to a "pos pemadam kebakaran" than
 *  the earlier droplet-in-a-square icon. */
const DEPOT_GLYPH = `
  <div style="
    width: 24px; height: 24px;
    background: ${FACILITY_COLORS.depot};
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid #ffffff;
  ">
    <svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <!-- pitched roof -->
      <path d="M 2 6 L 8 2 L 14 6 Z" fill="#ffffff"/>
      <!-- building body -->
      <rect x="3" y="6" width="10" height="8" fill="#ffffff"/>
      <!-- garage door (opening) -->
      <rect x="5.5" y="8.5" width="5" height="5.5" fill="${FACILITY_COLORS.depot}"/>
      <!-- door lintel highlight -->
      <rect x="5.5" y="8.5" width="5" height="0.8" fill="#ffffff" opacity="0.35"/>
    </svg>
  </div>
`;

const depotIcons = {
  idle: selectableIcon(DEPOT_GLYPH, 24, FACILITY_COLORS.depot, false),
  selected: selectableIcon(DEPOT_GLYPH, 24, FACILITY_COLORS.depot, true),
};

interface DepotMarkersProps {
  depots: Depot[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

function fmtCoord(v: number): string {
  return v.toFixed(5);
}

export function DepotMarkers({ depots, selectedId, onSelect }: DepotMarkersProps) {
  return (
    <>
      {depots.map((d) => (
        <Marker
          key={d.id}
          position={[d.lat, d.lon]}
          icon={d.id === selectedId ? depotIcons.selected : depotIcons.idle}
          zIndexOffset={d.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect?.(d.id) }}
        >
          <Tooltip direction="top" offset={[0, -14]} opacity={1}>
            <PopupShell title={d.name ?? `Depo ${d.id}`} subtitle={d.city ?? "Kota Surabaya"}>
              <PopupRow label="ID" value={d.id} />
              <PopupRow label="Koordinat" value={`${fmtCoord(d.lat)}, ${fmtCoord(d.lon)}`} />
              <ClickHint />
            </PopupShell>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
