"use client";

import type { Depot } from "../../types";
import { FacilityLayer } from "./facility-layer";
import { ClickHint, ClosedTag, PopupAction, PopupRow, PopupShell } from "./marker-popup";

interface DepotMarkersProps {
  depots: Depot[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Depots switched off for the next run. */
  disabledIds?: ReadonlySet<string>;
  onToggleDisabled?: (id: string) => void;
}

function fmtCoord(v: number): string {
  return v.toFixed(5);
}

export function DepotMarkers({
  depots,
  selectedId,
  onSelect,
  disabledIds,
  onToggleDisabled,
}: DepotMarkersProps) {
  return (
    <FacilityLayer
      kind="depot"
      items={depots}
      selectedId={selectedId}
      onSelect={onSelect}
      closedIds={disabledIds}
      interactiveTooltip={Boolean(onToggleDisabled)}
      renderTooltip={(d) => {
        const off = disabledIds?.has(d.id) ?? false;
        return (
          <PopupShell
            title={d.name ?? `Depo ${d.id}`}
            subtitle={d.address ?? "Alamat belum tercatat"}
          >
            {off ? <ClosedTag label="Nonaktif" /> : null}
            <PopupRow label="ID" value={d.id} />
            <PopupRow label="Koordinat" value={`${fmtCoord(d.lat)}, ${fmtCoord(d.lon)}`} />
            {onToggleDisabled ? (
              <PopupAction
                closed={off}
                closeLabel="Nonaktifkan depo"
                openLabel="Aktifkan kembali"
                note={
                  off
                    ? "Armada depo ini tidak diberangkatkan pada optimasi berikutnya."
                    : "Armada depo ini tidak akan diberangkatkan pada optimasi berikutnya."
                }
                onToggle={() => onToggleDisabled(d.id)}
              />
            ) : null}
            <ClickHint />
          </PopupShell>
        );
      }}
    />
  );
}
