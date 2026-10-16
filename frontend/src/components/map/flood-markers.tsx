"use client";

import type { ExpressionSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";

import { formatNumber } from "../../lib/format-metrics";
import { DEFAULT_SI, SI_PALETTE, siColor } from "../../lib/map-constants";
import type { FloodPoint } from "../../types";
import { HoverTooltip, useLayerHover } from "./hover-tooltip";
import { useMapContext } from "./map-context";
import { animateSwap, beforeIdFor, geojsonSource, idSignature, removeOverlay } from "./map-layers";

interface FloodMarkersProps {
  points: FloodPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

const SOURCE = "app-floods";
const PULSE_A = "app-floods-pulse-a";
const PULSE_B = "app-floods-pulse-b";
const HALO = "app-floods-halo";
const DOT = "app-floods-dot";
const LAYERS = [PULSE_A, PULSE_B, HALO, DOT];

const PULSE_MS = 1600;

function siLabel(si: number): string {
  for (const b of SI_PALETTE) if (si <= b.max) return b.labelId;
  return SI_PALETTE[SI_PALETTE.length - 1].labelId;
}

/** Dot diameter in px: deeper water, bigger dot. */
function dotSize(p: FloodPoint): number {
  return Math.max(14, Math.min(26, Math.round(12 + Math.log((p.ketinggian_cm ?? 20) + 1) * 2.4)));
}

/**
 * Flood points, drawn by MapLibre as circles so they stay fixed to the map while
 * it pans, zooms, tilts or resizes. Critical points pulse; the selected one has a
 * soft halo in its own colour.
 */
export function FloodMarkers({ points, selectedId, onSelect }: FloodMarkersProps) {
  const { map, styleVersion } = useMapContext();
  const selectedRef = useRef<string | null>(selectedId ?? null);
  const fx = useRef({ opacity: 1, scale: 1 });
  const lastSignature = useRef<string | null>(null);
  const cancelSwap = useRef<(() => void) | null>(null);

  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: points.map((p, index) => {
        const si = p.si_value ?? DEFAULT_SI;
        return {
          type: "Feature",
          properties: {
            id: p.id,
            index,
            color: siColor(si),
            r: dotSize(p) / 2,
            critical: si >= 0.6,
          },
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        };
      }),
    }),
    [points],
  );
  const signature = useMemo(() => idSignature(points), [points]);
  // With no critical point the rings have nothing to draw, so the pulse sleeps
  // instead of restyling the map (and so repainting it) thirty times a second.
  const hasCritical = useRef(false);
  useEffect(() => {
    hasCritical.current = data.features.some((f) => f.properties?.critical);
  }, [data]);

  useEffect(() => {
    // Paints the dot and halo for the current selection and animation frame.
    const paint = () => {
      if (!map.getLayer(DOT)) return;
      const { opacity, scale } = fx.current;
      const sel = selectedRef.current ?? "";
      const radius: ExpressionSpecification = [
        "*",
        ["case", ["==", ["get", "id"], sel], ["+", ["get", "r"], 2], ["get", "r"]],
        scale,
      ];
      map.setPaintProperty(DOT, "circle-radius", radius);
      map.setPaintProperty(DOT, "circle-opacity", opacity);
      map.setPaintProperty(DOT, "circle-stroke-opacity", opacity);
      map.setFilter(HALO, ["==", ["get", "id"], sel]);
      map.setPaintProperty(HALO, "circle-opacity", 0.3 * opacity);
    };
    selectedRef.current = selectedId ?? null;

    const src = geojsonSource(map, SOURCE);
    if (!src) {
      map.addSource(SOURCE, { type: "geojson", data });
      const before = beforeIdFor(map, "app-floods");
      const critical: ExpressionSpecification = ["==", ["get", "critical"], true];
      for (const id of [PULSE_A, PULSE_B]) {
        map.addLayer(
          {
            id,
            type: "circle",
            source: SOURCE,
            filter: critical,
            paint: { "circle-color": ["get", "color"], "circle-radius": 0, "circle-opacity": 0 },
          },
          before,
        );
      }
      map.addLayer(
        {
          id: HALO,
          type: "circle",
          source: SOURCE,
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["+", ["get", "r"], 13],
            "circle-opacity": 0.3,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: DOT,
          type: "circle",
          source: SOURCE,
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["get", "r"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        },
        before,
      );
      lastSignature.current = signature;
    } else if (lastSignature.current !== signature) {
      // A different set of points (a new study area): fade the old out, pop the new in.
      lastSignature.current = signature;
      cancelSwap.current?.();
      cancelSwap.current = animateSwap(
        (opacity, scale) => {
          fx.current = { opacity, scale };
          paint();
        },
        () => src.setData(data),
      );
      return;
    } else {
      src.setData(data);
    }
    paint();
  }, [map, styleVersion, data, signature, selectedId]);

  // Two rings, half a beat apart, grow and fade around each critical point.
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 33 || !hasCritical.current || !map.getLayer(PULSE_A)) return;
      last = now;
      [PULSE_A, PULSE_B].forEach((id, i) => {
        const t = (now / PULSE_MS + i * 0.5) % 1;
        const grow = 0.35 + 1.55 * (1 - (1 - t) * (1 - t));
        const alpha = t < 0.6 ? 0.85 * (1 - t / 0.6) : 0;
        map.setPaintProperty(id, "circle-radius", ["*", ["+", ["get", "r"], 4], grow]);
        map.setPaintProperty(id, "circle-opacity", alpha * fx.current.opacity);
      });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [map]);

  useEffect(
    () => () => {
      cancelSwap.current?.();
      removeOverlay(map, LAYERS, SOURCE);
    },
    [map],
  );

  const hover = useLayerHover(DOT, true, {
    onClick: (f) => onSelect?.(String(f.properties.id)),
  });
  if (!hover) return null;
  const p = points.find((pt) => pt.id === hover.feature.properties.id);
  if (!p) return null;
  const si = p.si_value ?? DEFAULT_SI;
  const color = siColor(si);
  const at = map.project([p.lon, p.lat]);

  // Hover shows a glance; a click opens the full detail panel.
  return (
    <HoverTooltip x={at.x} y={at.y} gap={dotSize(p) / 2 + 8}>
      <div className="flex max-w-[240px] min-w-[170px] flex-col gap-[3px]">
        <div className="flex items-center justify-between gap-8">
          <span className="text-midnight-ink text-[13px] font-bold tracking-[-0.13px]">
            Genangan {Number(hover.feature.properties.index) + 1}
          </span>
          <span
            className="rounded-md px-[7px] py-px text-[10.5px] font-bold text-white"
            style={{ background: color }}
          >
            {siLabel(si)} · {si.toFixed(2)}
          </span>
        </div>
        {p.deskripsi?.trim() ? (
          <div className="text-slate line-clamp-2 text-[11px] leading-[1.35] font-medium">
            {p.deskripsi.trim()}
          </div>
        ) : null}
        <div className="text-midnight-ink text-[11.5px] font-semibold">
          {p.ketinggian_cm != null ? `${formatNumber(p.ketinggian_cm)} cm` : "-"}
          {p.volume_l != null ? ` · ${formatNumber(p.volume_l)} L` : ""}
        </div>
        <div className="text-slate text-[10.5px] font-medium">Klik untuk detail lengkap</div>
      </div>
    </HoverTooltip>
  );
}
