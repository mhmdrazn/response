"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker } from "react-leaflet";

import { DEFAULT_SI, siColor } from "../../lib/map-constants";
import type { FloodPoint } from "../../types";

interface FloodMarkersProps {
  points: FloodPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
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
  const ringSize = dotSize + 14;
  const ring = selected
    ? `<div style="
        position:absolute;
        left:${(box - ringSize) / 2}px; top:${(box - ringSize) / 2}px;
        width:${ringSize}px; height:${ringSize}px;
        border-radius:50%;
        border:2.5px solid #171717;
        background:rgba(255,255,255,0.35);
        pointer-events:none;
      "></div>`
    : "";
  return L.divIcon({
    html: `
      <div class="flood-marker" style="width:${box}px; height:${box}px;">
        ${pulse}
        ${ring}
        
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

export function FloodMarkers({ points, selectedId, onSelect }: FloodMarkersProps) {
  return (
    <>
      {points.map((p) => (
        <FloodMarker key={p.id} point={p} selected={p.id === selectedId} onSelect={onSelect} />
      ))}
    </>
  );
}

interface FloodMarkerProps {
  point: FloodPoint;
  selected: boolean;
  onSelect?: (id: string) => void;
}

function FloodMarker({ point: p, selected, onSelect }: FloodMarkerProps) {
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
    />
  );
}
