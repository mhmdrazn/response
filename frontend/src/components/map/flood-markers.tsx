"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker, Tooltip } from "react-leaflet";

import { formatDateTimeId } from "../../lib/format";
import { SI_PALETTE, siColor } from "../../lib/map-constants";
import type { FloodPoint } from "../../types";
import { DescBlock, PopupRow, PopupShell, SiPill } from "./marker-popup";

interface FloodMarkersProps {
  points: FloodPoint[];
}

function siLabel(si: number): string {
  for (const b of SI_PALETTE) if (si <= b.max) return b.labelId;
  return SI_PALETTE[SI_PALETTE.length - 1].labelId;
}

function buildIcon(color: string, dotSize: number, isCritical: boolean): L.DivIcon {
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
  return L.divIcon({
    html: `
      <div class="flood-marker" style="width:${box}px; height:${box}px;">
        ${pulse}
        
        <div class="flood-marker-dot" style="
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

export function FloodMarkers({ points }: FloodMarkersProps) {
  return (
    <>
      {points.map((p, idx) => (
        <FloodMarker key={p.id} point={p} index={idx} />
      ))}
    </>
  );
}

function FloodMarker({ point: p, index }: { point: FloodPoint; index: number }) {
  const si = p.si_value ?? 0.5;
  const color = siColor(si);
  const dotSize = Math.max(
    14,
    Math.min(26, Math.round(12 + Math.log((p.ketinggian_cm ?? 20) + 1) * 2.4)),
  );
  const isEmergency = si >= 0.6;
  const icon = useMemo(() => buildIcon(color, dotSize, isEmergency), [color, dotSize, isEmergency]);
  const when = formatDateTimeId(p.datetime);

  return (
    <Marker position={[p.lat, p.lon]} icon={icon}>
      <Tooltip direction="top" offset={[0, -18]} opacity={1}>
        <PopupShell title={`Genangan ${index + 1}`} subtitle={when ?? undefined}>
          {p.ketinggian_cm != null ? (
            <PopupRow label="Ketinggian" value={`${p.ketinggian_cm} cm`} />
          ) : null}
          <PopupRow label="Severity" value={<SiPill si={si} label={siLabel(si)} />} />
          <DescBlock text={p.deskripsi} max={140} />
        </PopupShell>
      </Tooltip>
    </Marker>
  );
}
