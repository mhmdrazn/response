"use client";

import type { Depot } from "../../types";
import { FacilityLayer } from "./facility-layer";
import { ClickHint, PopupRow, PopupShell } from "./marker-popup";

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
    <FacilityLayer
      kind="depot"
      items={depots}
      selectedId={selectedId}
      onSelect={onSelect}
      renderTooltip={(d) => (
        <PopupShell
          title={d.name ?? `Depo ${d.id}`}
          subtitle={d.address ?? "Alamat belum tercatat"}
        >
          <PopupRow label="ID" value={d.id} />
          <PopupRow label="Koordinat" value={`${fmtCoord(d.lat)}, ${fmtCoord(d.lon)}`} />
          <ClickHint />
        </PopupShell>
      )}
    />
  );
}
