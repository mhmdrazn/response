"use client";

import { localizeHighway, localizeWaterway } from "../../lib/osm-labels";
import type { IntermediateFacility } from "../../types";
import { FacilityLayer } from "./facility-layer";
import { ClickHint, ClosedTag, PopupAction, PopupRow, PopupShell } from "./marker-popup";

interface IfMarkersProps {
  ifs: IntermediateFacility[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Outlets that cannot take water for the next run (an overflowing river, say). */
  closedIds?: ReadonlySet<string>;
  onToggleClosed?: (id: string) => void;
}

export function IfMarkers({
  ifs,
  selectedId,
  onSelect,
  closedIds,
  onToggleClosed,
}: IfMarkersProps) {
  return (
    <FacilityLayer
      kind="if"
      items={ifs}
      selectedId={selectedId}
      onSelect={onSelect}
      closedIds={closedIds}
      interactiveTooltip={Boolean(onToggleClosed)}
      renderTooltip={(f) => {
        const closed = closedIds?.has(f.id) ?? false;
        return (
          <PopupShell title={f.highway_name ?? `Titik Buang Air ${f.id}`}>
            {closed ? <ClosedTag label="Ditutup" /> : null}
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
            {onToggleClosed ? (
              <PopupAction
                closed={closed}
                closeLabel="Tutup titik buang"
                openLabel="Buka kembali"
                note={
                  closed
                    ? "Tidak dipakai membuang air pada optimasi berikutnya (mis. sungai meluap)."
                    : "Misalnya sungai meluap: tangki tidak akan dikosongkan di sini."
                }
                onToggle={() => onToggleClosed(f.id)}
              />
            ) : null}
            <ClickHint />
          </PopupShell>
        );
      }}
    />
  );
}
