"use client";

import type { ExpressionSpecification, GeoJSONSource } from "maplibre-gl";
import { useEffect, useMemo } from "react";

import { formatDuration, formatMeters } from "../../lib/format-metrics";
import { ROUTE_COLORS } from "../../lib/map-constants";
import type { RouteOut } from "../../types";
import { HoverTooltip, hitsLayers, useLayerHover } from "./hover-tooltip";
import { POINT_HIT_LAYERS, useMapContext } from "./map-context";
import { beforeIdFor } from "./map-layers";

interface RoutePolylinesProps {
  routes: RouteOut[];
  highlightId: string | null;
  /** Route whose detail panel is open; drawn thicker. */
  selectedId?: string | null;
  onHover: (vehicleId: string | null) => void;
  onSelect?: (vehicleId: string) => void;
}

export const ROUTE_SOURCE = "app-routes";
export const ROUTE_LINE_LAYER = "app-routes-line";
export const ROUTE_HIT_LAYER = "app-routes-hit";

export function RoutePolylines({
  routes,
  highlightId,
  selectedId,
  onHover,
  onSelect,
}: RoutePolylinesProps) {
  const { map, styleVersion } = useMapContext();

  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: "FeatureCollection",
      features: routes.map((r) => ({
        type: "Feature",
        properties: {
          id: r.vehicle_id,
          color: ROUTE_COLORS[r.route_color_index % ROUTE_COLORS.length],
        },
        geometry: { type: "LineString", coordinates: r.polyline.map(([la, lo]) => [lo, la]) },
      })),
    }),
    [routes],
  );

  useEffect(() => {
    const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else map.addSource(ROUTE_SOURCE, { type: "geojson", data });
    const before = beforeIdFor(map, "app-routes");
    if (!map.getLayer(ROUTE_LINE_LAYER)) {
      map.addLayer(
        {
          id: ROUTE_LINE_LAYER,
          type: "line",
          source: ROUTE_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.9 },
        },
        before,
      );
    }
    // A wide invisible line makes the thin route easy to hover and click.
    if (!map.getLayer(ROUTE_HIT_LAYER)) {
      map.addLayer(
        {
          id: ROUTE_HIT_LAYER,
          type: "line",
          source: ROUTE_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#000000", "line-width": 16, "line-opacity": 0 },
        },
        before,
      );
    }
  }, [map, styleVersion, data]);

  useEffect(
    () => () => {
      if (!map.style) return;
      for (const id of [ROUTE_HIT_LAYER, ROUTE_LINE_LAYER])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
    },
    [map],
  );

  useEffect(() => {
    if (!map.getLayer(ROUTE_LINE_LAYER)) return;
    const active = [highlightId, selectedId].filter((v): v is string => Boolean(v));
    const isActive: ExpressionSpecification = ["in", ["get", "id"], ["literal", active]];
    map.setPaintProperty(ROUTE_LINE_LAYER, "line-width", ["case", isActive, 6, 4]);
    map.setPaintProperty(
      ROUTE_LINE_LAYER,
      "line-opacity",
      active.length > 0 ? ["case", isActive, 0.9, 0.35] : 0.9,
    );
  }, [map, styleVersion, highlightId, selectedId, data]);

  const hover = useLayerHover(
    ROUTE_HIT_LAYER,
    true,
    {
      onEnter: (f) => onHover(String(f.properties.id)),
      onLeave: () => onHover(null),
      onClick: (f) => onSelect?.(String(f.properties.id)),
    },
    POINT_HIT_LAYERS,
  );
  const hovered = hover ? routes.find((r) => r.vehicle_id === hover.feature.properties.id) : null;
  // A point under the pointer shows its own tooltip; don't stack two.
  if (!hover || !hovered || hitsLayers(map, hover.x, hover.y, POINT_HIT_LAYERS)) return null;
  const color = ROUTE_COLORS[hovered.route_color_index % ROUTE_COLORS.length];

  return (
    <HoverTooltip x={hover.x} y={hover.y}>
      <div className="max-w-[230px] min-w-0">
        <div className="text-midnight-ink flex items-center gap-[6px] text-[13px] font-bold tracking-[-0.13px]">
          <span
            aria-hidden
            className="inline-block h-[10px] w-[10px] flex-shrink-0 rounded-full"
            style={{ background: color }}
          />
          Kendaraan {hovered.vehicle_id}
        </div>
        <div className="text-slate mb-[4px] text-[11px] font-semibold">
          {hovered.depot_name || hovered.depot_id} · {hovered.capacity_l.toLocaleString()} L
        </div>
        <div className="text-midnight-ink text-[12px]">
          {hovered.visit_count_flood} titik genangan · {hovered.visit_count_if} sungai
          <br />
          {formatMeters(hovered.total_distance_m)} · {formatDuration(hovered.total_time_s)}
        </div>
        <div className="text-slate mt-[3px] text-[10.5px] font-medium">
          Klik untuk detail lengkap
        </div>
      </div>
    </HoverTooltip>
  );
}
