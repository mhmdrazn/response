"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  /** Items out of service for the next run: drawn faded with a red badge. */
  closedIds?: ReadonlySet<string>;
  /**
   * The tooltip has buttons: it stays open while the pointer moves from the icon
   * into it, and takes clicks.
   */
  interactiveTooltip?: boolean;
}

/** Red of the "closed" badge (the SI palette's critical hue). */
const CLOSED_BADGE = "#DC2626";
/** How long a tooltip with buttons waits for the pointer to reach it. */
const STICKY_GRACE_MS = 300;
const NO_CLOSED: ReadonlySet<string> = new Set();

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
  closedIds = NO_CLOSED,
  interactiveTooltip = false,
}: FacilityLayerProps<T>) {
  const { map, styleVersion } = useMapContext();
  const source = `app-${kind}`;
  const halo = `app-${kind}-halo`;
  const icon = `app-${kind}-icon`;
  const badge = `app-${kind}-closed`;
  const size = FACILITY_ICON_SIZE[kind];
  const fx = useRef({ opacity: 1, scale: 1 });
  const lastSignature = useRef<string | null>(null);
  const cancelSwap = useRef<((map?: MapLibreMap) => void) | null>(null);

  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: items.map((f) => ({
        type: "Feature",
        properties: { id: f.id, closed: closedIds.has(f.id) },
        geometry: { type: "Point", coordinates: [f.lon, f.lat] },
      })),
    }),
    [items, closedIds],
  );
  const signature = useMemo(() => idSignature(items), [items]);

  useEffect(() => {
    let cancelled = false;
    const sel = selectedId ?? "";
    const paint = () => {
      if (!map.getLayer(icon)) return;
      const { opacity, scale } = fx.current;
      // A closed one stays visible but steps back.
      map.setPaintProperty(icon, "icon-opacity", [
        "case",
        ["get", "closed"],
        0.4 * opacity,
        opacity,
      ]);
      map.setPaintProperty(badge, "circle-opacity", opacity);
      map.setPaintProperty(badge, "circle-stroke-opacity", opacity);
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
          cancelSwap.current?.(map);
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
      map.addLayer(
        {
          id: badge,
          type: "circle",
          source,
          filter: ["==", ["get", "closed"], true],
          paint: {
            "circle-color": CLOSED_BADGE,
            "circle-radius": 4.5,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            // Top-right corner of the icon.
            "circle-translate": [size / 2 - 3, -(size / 2 - 3)],
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
  }, [map, styleVersion, data, signature, selectedId, kind, source, halo, icon, badge, size]);

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
      cancelSwap.current?.(map);
      removeOverlay(map, [badge, icon, halo], source);
    },
    [map, icon, halo, badge, source],
  );

  // A tooltip with buttons outlives the hover by a moment, and for as long as the
  // pointer is on it, so the buttons can be reached.
  const [stickyId, setStickyId] = useState<string | null>(null);
  const overTip = useRef(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const closeSoon = (ms: number) => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      if (!overTip.current) setStickyId(null);
    }, ms);
  };
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const hover = useLayerHover(icon, true, {
    onEnter: (f) => {
      if (!interactiveTooltip) return;
      window.clearTimeout(leaveTimer.current);
      setStickyId(String(f.properties.id));
    },
    onLeave: () => {
      if (interactiveTooltip) closeSoon(STICKY_GRACE_MS);
    },
    onClick: (f) => {
      setStickyId(null);
      onSelect?.(String(f.properties.id));
    },
  });
  const shownId = interactiveTooltip ? stickyId : (hover?.feature.properties.id ?? null);
  if (!shownId) return null;
  const item = items.find((f) => f.id === shownId);
  if (!item) return null;
  const at = map.project([item.lon, item.lat]);

  return (
    <HoverTooltip
      x={at.x}
      y={at.y}
      gap={size / 2 + 6}
      interactive={interactiveTooltip}
      onPointerEnter={() => {
        overTip.current = true;
        window.clearTimeout(leaveTimer.current);
      }}
      onPointerLeave={() => {
        overTip.current = false;
        closeSoon(150);
      }}
    >
      {renderTooltip(item)}
    </HoverTooltip>
  );
}
