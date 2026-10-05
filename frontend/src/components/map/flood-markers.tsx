"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker, Tooltip } from "react-leaflet";

import { formatNumber } from "../../lib/format-metrics";
import { DEFAULT_SI, SI_PALETTE, siColor } from "../../lib/map-constants";
import type { FloodPoint } from "../../types";

interface FloodMarkersProps {
  points: FloodPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

function siLabel(si: number): string {
  for (const b of SI_PALETTE) if (si <= b.max) return b.labelId;
  return SI_PALETTE[SI_PALETTE.length - 1].labelId;
}

function buildIcon(
  color: string,
  dotSize: number,
  isCritical: boolean,
  selected: boolean,
): L.DivIcon {
  const box = 62;
  const pulse = isCritical
    ? `
      <div class="flood-marker-pulse" style="
        inset: ${Math.round((box - dotSize) / 2 - 4)}px;
        background: ${color};
      "></div>
      <div class="flood-marker-pulse secondary" style="
        inset: ${Math.round((box - dotSize) / 2 - 4)}px;
        background: ${color};
      "></div>
    `
    : "";
  // Selection reads as a soft halo in the point's own colour and a slightly
  // larger dot, not an outline, so it never competes with the severity colour.
  const haloSize = dotSize + 26;
  const halo = selected
    ? `<div class="soft-pop" style="
        position:absolute;
        left:${(box - haloSize) / 2}px; top:${(box - haloSize) / 2}px;
        width:${haloSize}px; height:${haloSize}px;
        border-radius:50%;
        background:color-mix(in srgb, ${color} 30%, transparent);
        pointer-events:none;
      "></div>`
    : "";
  return L.divIcon({
    html: `
      <div class="flood-marker" style="width:${box}px; height:${box}px;">
        ${pulse}
        ${halo}
        
        <div class="flood-marker-dot${selected ? " flood-dot-selected" : ""}" style="
          width:${dotSize}px;
          height:${dotSize}px;
          background:${color};
        "></div>
      </div>
    `,
    className: "",
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
}

export function FloodMarkers({ points, selectedId, onSelect }: FloodMarkersProps) {
  return (
    <>
      {points.map((p, idx) => (
        <FloodMarker
          key={p.id}
          point={p}
          index={idx}
          selected={p.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

interface FloodMarkerProps {
  point: FloodPoint;
  index: number;
  selected: boolean;
  onSelect?: (id: string) => void;
}

function FloodMarker({ point: p, index, selected, onSelect }: FloodMarkerProps) {
  const si = p.si_value ?? DEFAULT_SI;
  const color = siColor(si);
  const dotSize = Math.max(
    14,
    Math.min(26, Math.round(12 + Math.log((p.ketinggian_cm ?? 20) + 1) * 2.4)),
  );
  const isEmergency = si >= 0.6;
  const icon = useMemo(
    () => buildIcon(color, dotSize, isEmergency, selected),
    [color, dotSize, isEmergency, selected],
  );

  return (
    <Marker
      position={[p.lat, p.lon]}
      icon={icon}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{ click: () => onSelect?.(p.id) }}
    >
      {/* Hover shows a glance; a click opens the full detail panel. */}
      <Tooltip direction="top" offset={[0, -16]} opacity={1}>
        <div className="flex min-w-[170px] max-w-[240px] flex-col gap-[3px]">
          <div className="flex items-center justify-between gap-8">
            <span className="text-[13px] font-bold tracking-[-0.13px] text-midnight-ink">
              Genangan {index + 1}
            </span>
            <span
              className="rounded-md px-[7px] py-px text-[10.5px] font-bold text-white"
              style={{ background: color }}
            >
              {siLabel(si)} · {si.toFixed(2)}
            </span>
          </div>
          {p.deskripsi?.trim() ? (
            <div className="line-clamp-2 text-[11px] font-medium leading-[1.35] text-slate">
              {p.deskripsi.trim()}
            </div>
          ) : null}
          <div className="text-[11.5px] font-semibold text-midnight-ink">
            {p.ketinggian_cm != null ? `${formatNumber(p.ketinggian_cm)} cm` : "-"}
            {p.volume_l != null ? ` · ${formatNumber(p.volume_l)} L` : ""}
          </div>
          <div className="text-[10.5px] font-medium text-slate">Klik untuk detail lengkap</div>
        </div>
      </Tooltip>
    </Marker>
  );
}
