"use client";

import { localizeHealthcare } from "../../lib/osm-labels";
import type { Faskes } from "../../types";
import { FacilityLayer } from "./facility-layer";
import { ClickHint, PopupRow, PopupShell } from "./marker-popup";

interface FaskesMarkersProps {
  faskes: Faskes[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function FaskesMarkers({ faskes, selectedId, onSelect }: FaskesMarkersProps) {
  return (
    <FacilityLayer
      kind="faskes"
      items={faskes}
      selectedId={selectedId}
      onSelect={onSelect}
      renderTooltip={(f) => (
        <PopupShell title={f.name ?? `Faskes ${f.id}`}>
          {f.street ? <PopupRow label="Alamat" value={f.street} /> : null}
          {f.healthcare ? (
            <PopupRow label="Jenis" value={localizeHealthcare(f.healthcare) ?? f.healthcare} />
          ) : f.amenity ? (
            <PopupRow label="Jenis" value={localizeHealthcare(f.amenity) ?? f.amenity} />
          ) : null}
          <ClickHint />
        </PopupShell>
      )}
    />
  );
}
