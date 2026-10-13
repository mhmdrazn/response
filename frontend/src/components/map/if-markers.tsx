"use client";

import { localizeHighway, localizeWaterway } from "../../lib/osm-labels";
import type { IntermediateFacility } from "../../types";
import { FacilityLayer } from "./facility-layer";
import { ClickHint, PopupRow, PopupShell } from "./marker-popup";

interface IfMarkersProps {
  ifs: IntermediateFacility[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function IfMarkers({ ifs, selectedId, onSelect }: IfMarkersProps) {
  return (
    <FacilityLayer
      kind="if"
      items={ifs}
      selectedId={selectedId}
      onSelect={onSelect}
      renderTooltip={(f) => (
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
      )}
    />
  );
}
