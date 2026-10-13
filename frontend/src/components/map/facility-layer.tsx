"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  FACILITY_ICON_SIZE,
  ensureFacilityIcon,
  facilityColor,
  facilityIconId,
  type FacilityKind,
} from "../../lib/map-icons";
import { HoverTooltip, useLayerHover } from "./hover-tooltip";
import { useMapContext } from "./map-context";
import { animateSwap, beforeIdFor, geojsonSource, idSignature, removeOverlay } from "./map-layers";

interface FacilityItem {
  id: string;
  lat: number;
  lon: number;
}

interface FacilityLayerProps<T extends FacilityItem> {
  kind: FacilityKind;
  items: T[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Content of the hover tooltip for one item. */
  renderTooltip: (item: T) => ReactNode;
}

/**
 * Depots, outlets or clinics as a MapLibre symbol layer: the icon stays fixed to
 * the map while it moves. The selected one sits on a soft halo of its colour.
 */
export function FacilityLayer<T extends FacilityItem>({
  kind,
  items,
  selectedId,
  onSelect,
  renderTooltip,
}: FacilityLayerProps<T>) {
  const { map, styleVersion } = useMapContext();
  const source = `app-${kind}`;
  const halo = `app-${kind}-halo`;
  const icon = `app-${kind}-icon`;
  const size = FACILITY_ICON_SIZE[kind];
  const fx = useRef({ opacity: 1, scale: 1 });
  const lastSignature = useRef<string | null>(null);
  const cancelSwap = useRef<(() => void) | null>(null);

  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: items.map((f) => ({
        type: "Feature",
        properties: { id: f.id },
        geometry: { type: "Point", coordinates: [f.lon, f.lat] },
      })),
    }),
    [items],
  );
  const signature = useMemo(() => idSignature(items), [items]);

  useEffect(() => {
    let cancelled = false;
    const sel = selectedId ?? "";
    const paint = () => {
      if (!map.getLayer(icon)) return;
      const { opacity, scale } = fx.current;
      map.setPaintProperty(icon, "icon-opacity", opacity);
      map.setLayoutProperty(icon, "icon-size", scale);
      map.setFilter(halo, ["==", ["get", "id"], sel]);
      map.setPaintProperty(halo, "circle-opacity", 0.3 * opacity);
    };

    const run = async () => {
      const src = geojsonSource(map, source);
      if (src) {
        if (lastSignature.current !== signature) {
          // A different set of facilities: fade the old out, pop the new in.
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
        }
        src.setData(data);
        paint();
        return;
      }
      await ensureFacilityIcon(map, kind);
      if (cancelled || geojsonSource(map, source)) return;
      map.addSource(source, { type: "geojson", data });
      const before = beforeIdFor(map, `app-${kind}`);
      map.addLayer(
        {
          id: halo,
          type: "circle",
          source,
          filter: ["==", ["get", "id"], ""],
          paint: {
            "circle-color": facilityColor(kind),
            "circle-radius": size / 2 + 8,
            "circle-opacity": 0.3,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: icon,
          type: "symbol",
          source,
          layout: {
            "icon-image": facilityIconId(kind),
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            // The selected one draws last, on top of its neighbours.
            "symbol-sort-key": ["case", ["==", ["get", "id"], sel], 1, 0],
          },
        },
        before,
      );
      lastSignature.current = signature;
      paint();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [map, styleVersion, data, signature, selectedId, kind, source, halo, icon, size]);

  useEffect(() => {
    if (map.getLayer(icon)) {
      map.setLayoutProperty(icon, "symbol-sort-key", [
        "case",
        ["==", ["get", "id"], selectedId ?? ""],
        1,
        0,
      ]);
    }
  }, [map, icon, selectedId, styleVersion]);

  useEffect(
    () => () => {
      cancelSwap.current?.();
      removeOverlay(map, [icon, halo], source);
    },
    [map, icon, halo, source],
  );

  const hover = useLayerHover(icon, true, {
    onClick: (f) => onSelect?.(String(f.properties.id)),
  });
  if (!hover) return null;
  const item = items.find((f) => f.id === hover.feature.properties.id);
  if (!item) return null;
  const at = map.project([item.lon, item.lat]);

  return (
    <HoverTooltip x={at.x} y={at.y} gap={size / 2 + 6}>
      {renderTooltip(item)}
    </HoverTooltip>
  );
}
